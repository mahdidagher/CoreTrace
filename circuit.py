"""Live register-transfer schematic for the simulator."""

import tkinter as tk
from tkinter import ttk

from cpu import MNEMONICS, control_unit, decode


class Circuit(tk.Toplevel):
    def __init__(self, simulator):
        super().__init__(simulator.root)
        self.simulator = simulator
        self.title("Dual-Core CPU · Live Circuit")
        self.geometry("1080x690")
        self.minsize(860, 550)
        controls = ttk.Frame(self, padding=6)
        controls.pack(side="bottom")
        for text, command in (
            ("Reset", simulator.reset), ("Step Clock", simulator.step),
            ("Run", simulator.run), ("Pause", simulator.pause),
        ):
            ttk.Button(controls, text=text, command=command).pack(side="left", padx=3)
        self.canvas = tk.Canvas(self, background="#111b2b", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", lambda _: self.draw())

    def draw(self):
        c = self.canvas
        c.delete("all")
        scale = min(c.winfo_width() / 1080, c.winfo_height() / 650)
        c.configure(scrollregion=(0, 0, 1080, 650))

        def label(x, y, text, color="#e2eefb", size=11):
            c.create_text(x, y, text=text, fill=color, font=("Consolas", max(7, int(size * scale))))

        def block(x, y, w, h, title, detail="", active=False):
            c.create_rectangle(x, y, x + w, y + h, fill="#22334a",
                               outline="#55dbc3" if active else "#65809f", width=2)
            label(x + w / 2, y + 16, title, size=13)
            label(x + w / 2, y + 37, detail, "#b2c9df", 10)

        def wire(points, active=False, control=False):
            c.create_line(*points, fill=("#ffca77" if control else "#55dbc3") if active else "#58748f",
                          width=3 if active else 1.5, arrow="last", dash=(5, 4) if control else ())

        cpu = self.simulator.cpu
        events = self.simulator.last_events
        clock = cpu.cycle if cpu else 0
        label(540, 26, f"DUAL-CORE PROCESSOR   /   CLOCK {clock:03}", size=18)
        label(540, 50, "Teal: active data path     Gold dashed: active control signal", "#b2c9df")
        memory_events = []
        for index, x in enumerate((30, 565)):
            core = cpu.cores[index] if cpu and index < len(cpu.cores) else None
            event = events.get(index)
            decoded = decode(event[1].word) if event else None
            signals = control_unit(decoded.opcode) if decoded else None
            using_alu = bool(signals and signals.alu is not None)
            reading = bool(signals and signals.memory_read)
            storing = bool(signals and signals.memory_write)
            writing = bool(signals and signals.register_write)
            halted = bool(signals and signals.halt)
            label(x + 233, 80, f"CORE {index}  /  " + (
                MNEMONICS[decoded.opcode] if decoded else "READY" if core and core.active else "IDLE"
            ), size=15)
            if reading:
                memory_events.append(f"C{index} read snapshot M[{decoded.immediate:02X}] = {core.registers[decoded.rd]:02X}")
            if storing:
                memory_events.append(f"C{index} buffered M[{decoded.immediate:02X}] = {core.registers[decoded.rd]:02X}")

            def path(points, active=False, control=False):
                coords = [coordinate + x if i % 2 == 0 else coordinate for i, coordinate in enumerate(points)]
                wire(coords, active, control)

            path((124, 132, 166, 132), bool(event))
            path((310, 132, 350, 132), bool(event))
            path((420, 154, 420, 193), bool(event))
            path((350, 141, 325, 141, 325, 251, 120, 251, 120, 284), using_alu or storing or writing)
            path((494, 132, 505, 132, 505, 395, 374, 395), reading or storing)
            path((350, 217, 92, 217, 92, 154), bool(event), True)
            path((405, 241, 405, 260, 301, 260, 301, 284), using_alu, True)
            path((465, 241, 465, 456, 375, 456, 375, 465), writing, True)
            path((350, 229, 340, 229, 340, 360, 300, 360, 300, 372), reading or storing, True)
            path((205, 306, 250, 306), using_alu)
            path((158, 345, 158, 395, 250, 395), storing)
            path((300, 331, 300, 351, 391, 351, 391, 465), using_alu)
            path((320, 419, 320, 445, 349, 445, 349, 465), reading)
            path((300, 489, 90, 489, 90, 345), writing)
            port = 260 if index == 0 else 650
            path((270, 419, 270, 537, port - x, 537, port - x, 558), storing)
            path((port + 30 - x, 558, port + 30 - x, 524, 290, 524, 290, 419), reading)

            def unit(px, y, w, h, title, detail="", active=False):
                block(x + px, y, w, h, title, detail, active)

            pc = f"PC = {core.pc:04X}" if core else "Disabled"
            unit(10, 108, 114, 46, "PC / +1", pc, bool(event))
            unit(166, 108, 144, 46, "Program ROM", f"Fetch @{event[0]:04X}" if event else "", bool(event))
            unit(350, 108, 144, 46, "Decoder", f"IR = {event[1].word:04X}" if event else "", bool(event))
            unit(350, 193, 144, 48, "Control Unit", "Halt / hold PC" if halted else "Decode opcode", bool(event))
            unit(45, 284, 160, 61, "Register File", "8 registers × 8 bits", using_alu or storing or writing)
            if core:
                label(x + 125, 333, " ".join(f"{v:02X}" for v in core.registers), size=9)
            unit(250, 284, 102, 47, "ALU", MNEMONICS[decoded.opcode] if using_alu else "8-bit", using_alu)
            unit(250, 372, 124, 47, "Memory I/O", f"Addr {decoded.immediate:02X}" if reading or storing else "addr / data", reading or storing)
            unit(300, 465, 146, 47, "Writeback MUX", "ALU" if using_alu else "Memory" if reading else "Idle", writing)

        block(160, 558, 760, 60, "Shared Data Memory · Snapshot / Commit · 256 × 8 bits",
              "  |  ".join(memory_events) or "Both cores access the same byte-addressed memory",
              bool(memory_events))
        c.scale("all", 0, 0, scale, scale)
        c.move("all", (c.winfo_width() - 1080 * scale) / 2, (c.winfo_height() - 650 * scale) / 2)
