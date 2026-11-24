from dataclasses import dataclass


@dataclass(frozen=True)
class Control:
    alu: int | None = None
    register_write: bool = False
    memory_read: bool = False
    memory_write: bool = False
    halt: bool = False


def control_unit(opcode):
    if 0 <= opcode < 8:
        return Control(alu=opcode, register_write=True)
    return {
        8: Control(register_write=True, memory_read=True),
        9: Control(memory_write=True),
        15: Control(halt=True),
    }[opcode]
