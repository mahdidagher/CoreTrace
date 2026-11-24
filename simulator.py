"""Interactive Tkinter front end. Run with python simulator.py."""

import tkinter as tk
from tkinter import ttk

from circuit import Circuit
from cpu import DEMO, Processor, assemble, control_unit, decode


class Simulator:
    def __init__(self, root):
        self.root = root
        self.cpu = None
        self.timer = None
        self.circuit = None
        self.last_events = {}
        self.editors = []
        self.states = []
        self.status = tk.StringVar(value="Assemble a program to begin.")
        self.single = tk.BooleanVar()
        root.title("CCEE 324 | Dual-Core CPU Simulator")
        root.geometry("1060x720")
        root.minsize(780, 620)
        root.columnconfigure(0, weight=1)
        root.rowconfigure(2, weight=1)

        heading = ttk.Frame(root, padding=(14, 12))
        heading.grid(sticky="ew")
        ttk.Label(heading, text="Dual-Core CPU Simulator", font=("Segoe UI", 20, "bold")).pack(anchor="w")
        ttk.Label(heading, text="8-bit datapath   |   16-bit instructions   |   256-byte shared memory").pack(anchor="w")
        toolbar = ttk.Frame(root, padding=(14, 0, 14, 8))
        toolbar.grid(row=1, sticky="ew")
        for label, command in [
            ("Load Demo", self.demo), ("Assemble / Reset", self.reset),
            ("Step Clock", self.step), ("Run", self.run), ("Pause", self.pause), ("Circuit View", self.show_circuit),
        ]:
            ttk.Button(toolbar, text=label, command=command).pack(side="left", padx=(0, 6))
        ttk.Checkbutton(toolbar, text="Single core", variable=self.single, command=self.reset).pack(side="left")

        cores = ttk.Frame(root, padding=(14, 0))
        cores.grid(row=2, sticky="nsew")
        cores.rowconfigure(0, weight=1)
        for index in range(2):
            cores.columnconfigure(index, weight=1, uniform="cores")
            panel = ttk.LabelFrame(cores, text=f"Core {index}", padding=8)
            panel.grid(row=0, column=index, sticky="nsew", padx=(0, 6) if index == 0 else (6, 0))
            editor = tk.Text(panel, height=9, width=35, undo=True, wrap="none", font=("Consolas", 11))
            editor.pack(fill="both", expand=True)
            editor.tag_configure("next", background="#d7ecff", foreground="#18325c")
            editor.bind("<<Modified>>", self.edited)
            self.editors.append(editor)
            state = ttk.Label(panel, font=("Consolas", 10), justify="left")
            state.pack(anchor="w", pady=(7, 0))
            self.states.append(state)

        lower = ttk.Panedwindow(root, orient="horizontal")
        lower.grid(row=3, sticky="ew", padx=14, pady=8)
        trace_panel = ttk.LabelFrame(lower, text="Execution trace", padding=5)
        memory_panel = ttk.LabelFrame(lower, text="Shared memory · hex", padding=5)
        lower.add(trace_panel, weight=3)
        lower.add(memory_panel, weight=2)
        self.trace = self.output(trace_panel, 52)
        self.memory = self.output(memory_panel, 55)
        ttk.Label(root, textvariable=self.status, padding=(14, 0, 14, 8), wraplength=740).grid(row=4, sticky="ew")
        self.demo()

    @staticmethod
    def output(panel, width):
        box = tk.Text(panel, height=11, width=width, font=("Consolas", 9), wrap="none", state="disabled")
        scroll = ttk.Scrollbar(panel, command=box.yview)
        box.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        box.pack(side="left", fill="both", expand=True)
        return box

    @staticmethod
    def write(box, value, append=False):
        box.configure(state="normal")
        if not append:
            box.delete("1.0", "end")
        box.insert("end", value)
        if append:
            box.see("end")
        box.configure(state="disabled")

    def edited(self, event):
        if event.widget.edit_modified():
            event.widget.edit_modified(False)
            self.pause()
            self.cpu = None
            self.last_events.clear()
            self.status.set("Source changed. Assemble / Reset to apply edits.")
            self.render()

    def demo(self):
        for editor, source in zip(self.editors, DEMO):
            editor.delete("1.0", "end")
            editor.insert("1.0", source)
            editor.edit_modified(False)
        self.reset()

    def reset(self):
        self.pause()
        self.cpu = None
        self.last_events.clear()
        self.write(self.trace, "")
        self.write(self.memory, "")
        programs = []
        try:
            for index, editor in enumerate(self.editors[:1 if self.single.get() else 2]):
                programs.append(assemble(editor.get("1.0", "end-1c")))
        except ValueError as error:
            self.status.set(f"Core {index} · {error}")
        else:
            self.cpu = Processor(*programs)
            self.status.set("Clock 0 · Ready" if self.cpu.active else "Clock 0 · No instructions")
        self.render()

    def show_circuit(self):
        if self.circuit is None or not self.circuit.winfo_exists():
            self.circuit = Circuit(self)
        self.circuit.lift()

    def render(self):
        if self.circuit is not None and self.circuit.winfo_exists():
            self.circuit.draw()
        for index, (editor, state) in enumerate(zip(self.editors, self.states)):
            editor.tag_remove("next", "1.0", "end")
            if not self.cpu or index >= len(self.cpu.cores):
                state.configure(text="Inactive")
                continue
            core = self.cpu.cores[index]
            heading = f"PC {core.pc:04X}   " + ("HALTED" if core.halted else "READY" if core.active else "END")
            if core.active:
                instruction = core.program[core.pc]
                editor.tag_add("next", f"{instruction.line}.0", f"{instruction.line}.end")
                editor.see(f"{instruction.line}.0")
                heading += f"   IR {instruction.word:04X}"
            registers = [f"R{i}={value:02X}" for i, value in enumerate(core.registers)]
            state.configure(text="\n".join((heading, "  ".join(registers[:4]), "  ".join(registers[4:]))))
        if self.cpu:
            position = self.memory.yview()[0]
            rows = [
                f"{address:02X}  " + " ".join(f"{v:02X}" for v in self.cpu.memory[address:address + 16])
                for address in range(0, 256, 16)
            ]
            self.write(self.memory, "\n".join(rows))
            self.memory.yview_moveto(position)

    def step(self):
        if not self.cpu or not self.cpu.active:
            return
        events = self.cpu.tick()
        self.last_events = {index: (pc, instruction) for index, pc, instruction, _ in events}
        for index, pc, instruction, effect in events:
            signals = control_unit(decode(instruction.word).opcode)
            controls = [
                name for name, enabled in (
                    ("ALU", signals.alu is not None), ("RegWrite", signals.register_write),
                    ("MemRead", signals.memory_read), ("MemWrite", signals.memory_write), ("Halt", signals.halt),
                ) if enabled
            ]
            line = f"T{self.cpu.cycle:03} C{index} PC={pc:04X} IR={instruction.word:04X}  {instruction.source}"
            self.write(self.trace, f"{line}\n    {' + '.join(controls)} | {effect}\n", append=True)
        self.render()
        phase = "Ready" if self.cpu.active else "Complete"
        self.status.set(f"Clock {self.cpu.cycle} · {phase}")

    def run(self):
        if self.timer is None and self.cpu and self.cpu.active:
            self.step()
            if self.cpu.active:
                self.timer = self.root.after(500, self.resume)

    def resume(self):
        self.timer = None
        self.run()

    def pause(self):
        if self.timer is not None:
            self.root.after_cancel(self.timer)
            self.timer = None


if __name__ == "__main__":
    root = tk.Tk()
    Simulator(root)
    root.mainloop()
