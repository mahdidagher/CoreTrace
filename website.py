
"""Serve the single-page simulator on localhost. Run with python website.py."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from performance import PerformanceMonitor
from cpu import DEMO, OPCODES, Processor, assemble, control_unit, decode
from dualcore.isa import byte

WEB = Path(__file__).with_name("web")

ASSETS = {
    "/": ("index.html", "text/html"),
    "/style.css": ("style.css", "text/css"),
    "/app.js": ("app.js", "text/javascript")
}


def simulate(payload):

    sources = payload.get("sources")

    if (
        not isinstance(sources, list)
        or len(sources) != 2
        or not all(isinstance(s, str) for s in sources)
    ):
        raise ValueError("Provide source text for both cores.")

    programs = []

    for index, source in enumerate(sources):
        try:
            programs.append(assemble(source))
        except ValueError as error:
            raise ValueError(f"Core {index}: {error}") from None

    if max(map(len, programs)) > 512:
        raise ValueError("Use at most 512 instructions per core.")

    # Initialize the CPU
    cpu = Processor(*programs)

    # Initialize the performance monitor
    monitor = PerformanceMonitor(
        core_count=len(cpu.cores)
    )

    seed = payload.get("seed")

    if seed is not None:

        if sum(map(len, programs)) != 1:
            raise ValueError(
                "Enter exactly one instruction in Instruction mode."
            )

        if (
            not isinstance(seed, list)
            or len(seed) != 3
            or not all(isinstance(v, str) for v in seed)
        ):
            raise ValueError(
                "Provide the R1, R2 and sample memory bytes."
            )

        r1, r2, value = map(byte, seed)

        for core in cpu.cores:
            core.registers[1] = r1
            core.registers[2] = r2

        cpu.memory[0x20] = value

    def frame(events):

        return {
            "clock": cpu.cycle,

            # Performance statistics for the current clock
            "performance": monitor.get_metrics(),

            "cores": [
                {
                    "pc": core.pc,
                    "registers": list(core.registers),
                    "halted": core.halted,
                    "next": (
                        core.program[core.pc].line
                        if core.active else None
                    )
                }
                for core in cpu.cores
            ],

            "memory": list(cpu.memory.snapshot()),
            "events": events,
        }

    # Initial CPU state before execution
    frames = [frame([])]

    # Execute the processor until both cores finish
    while cpu.active:

        events = []

        for index, pc, instruction, effect in cpu.tick():

            decoded = decode(instruction.word)
            signals = control_unit(decoded.opcode)

            events.append({
                "core": index,
                "pc": pc,
                "word": instruction.word,
                "source": instruction.source,
                "line": instruction.line,
                "effect": effect,

                "alu": signals.alu is not None,
                "read": signals.memory_read,
                "store": signals.memory_write,
                "write": signals.register_write,
                "halt": signals.halt,
            })

        # Record performance statistics for this clock
        monitor.record_cycle(events)

        # Save the CPU state and updated performance metrics
        frames.append(frame(events))

    return frames


class Handler(BaseHTTPRequestHandler):

    def send(self, status, content, mime):

        self.send_response(status)

        self.send_header(
            "Content-Type",
            f"{mime}; charset=utf-8"
        )

        self.send_header(
            "Content-Length",
            str(len(content))
        )

        self.end_headers()
        self.wfile.write(content)

    def send_json(self, status, obj):

        self.send(
            status,
            json.dumps(obj).encode(),
            "application/json"
        )

    def do_GET(self):

        if self.path == "/api/config":

            self.send_json(200, {
                "demo": DEMO,
                "opcodes": list(OPCODES)
            })

        elif self.path in ASSETS:

            name, mime = ASSETS[self.path]

            self.send(
                200,
                (WEB / name).read_bytes(),
                mime
            )

        else:

            self.send_error(404)

    def do_POST(self):

        if self.path != "/api/simulate":

            self.send_error(404)
            return

        try:

            length = int(
                self.headers.get("Content-Length", "0")
            )

            if not 0 < length <= 65536:
                raise ValueError(
                    "Request must contain at most 64 KiB."
                )

            payload = json.loads(
                self.rfile.read(length)
            )

            if not isinstance(payload, dict):
                raise ValueError(
                    "Expected a simulation request."
                )

            self.send_json(200, {
                "frames": simulate(payload)
            })

        except ValueError as error:

            self.send_json(400, {
                "error": str(error)
            })


if __name__ == "__main__":

    with ThreadingHTTPServer(
        ("127.0.0.1", 8000),
        Handler
    ) as server:

        print(
            "CPU Simulator · http://127.0.0.1:8000",
            flush=True
        )

        try:
            server.serve_forever()

        except KeyboardInterrupt:
            pass
