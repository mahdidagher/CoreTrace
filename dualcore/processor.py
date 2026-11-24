from .core import Core
from .memory import SharedMemory, TickMemoryPort


class Processor:
    def __init__(self, *programs):
        if len(programs) not in (1, 2):
            raise ValueError("Provide one or two programs")
        self.cores = [Core(program) for program in programs]
        self.memory = SharedMemory()
        self.cycle = 0

    @property
    def active(self):
        return any(core.active for core in self.cores)

    def tick(self):
        if not self.active:
            return []
        self.cycle += 1
        stores = []
        port = TickMemoryPort(self.memory.snapshot(), stores)
        events = [
            (index, *core.step(port))
            for index, core in enumerate(self.cores)
            if core.active
        ]
        for address, value in stores:
            self.memory[address] = value
        return events
