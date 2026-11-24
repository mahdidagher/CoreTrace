from dataclasses import dataclass, field

from .alu import alu
from .control import control_unit
from .isa import decode
from .registers import RegisterFile


@dataclass
class Core:
    program: tuple
    pc: int = 0
    registers: RegisterFile = field(default_factory=RegisterFile)
    halted: bool = False

    @property
    def active(self):
        return not self.halted and self.pc < len(self.program)

    def step(self, memory):
        if not self.active:
            return None
        pc = self.pc
        instruction = self.program[pc]
        decoded = decode(instruction.word)
        signals = control_unit(decoded.opcode)
        rd, address = decoded.rd, decoded.immediate
        if signals.halt:
            self.halted = True
            return pc, instruction, "Halted; PC held"
        if signals.memory_write:
            value = self.registers[rd]
            memory[address] = value
            effect = f"M[{address:02X}] ← {value:02X}"
        elif signals.register_write:
            if signals.alu is not None:
                left, right = self.registers[decoded.rs], self.registers[decoded.rt]
                value = alu(signals.alu, left, right)
                source = f" (ALU inputs {left:02X}, {right:02X})"
            else:
                value = memory[address]
                source = f" (read M[{address:02X}])"
            self.registers[rd] = value
            effect = f"R{rd} ← {value:02X}{source}"
        self.pc += 1
        return pc, instruction, effect
