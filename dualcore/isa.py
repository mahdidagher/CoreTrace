from dataclasses import dataclass
import re


OPCODES = {
    "ADD": 0, "SUB": 1, "AND": 2, "OR": 3, "XOR": 4, "NOR": 5,
    "SLL": 6, "SRL": 7, "LOAD": 8, "STORE": 9, "HALT": 15,
}
ALIASES = {"LW": "LOAD", "SW": "STORE"}
MNEMONICS = {value: key for key, value in OPCODES.items()}


def register(token):
    match = re.fullmatch(r"(?:R|\$R?)?([0-7])", token, re.IGNORECASE)
    if not match:
        raise ValueError(f"Expected register R0 through R7, got {token!r}")
    return int(match[1])


def byte(token):
    try:
        value = int(token, 0) if token.lower().startswith(("0x", "0b")) else int(token, 10)
    except ValueError:
        raise ValueError(f"Expected a decimal, hex, or binary byte, got {token!r}") from None
    if not 0 <= value <= 255:
        raise ValueError(f"Byte must be between 0 and 255, got {value}")
    return value


@dataclass(frozen=True)
class Instruction:
    word: int
    source: str
    line: int


def assemble(source):
    program = []
    for line, raw in enumerate(source.splitlines(), 1):
        statement = re.split(r"#|//", raw, maxsplit=1)[0].strip()
        if not statement:
            continue
        name, *operands = re.split(r"[\s,]+", statement)
        name = ALIASES.get(name.upper(), name.upper())
        try:
            if name not in OPCODES:
                raise ValueError(f"Unknown instruction {name!r}")
            opcode = OPCODES[name]
            expected = 3 if opcode < 8 else 0 if name == "HALT" else 2
            if len(operands) != expected:
                raise ValueError(f"{name} expects {expected} operands")
            word = opcode << 12
            if operands:
                word |= register(operands[0]) << 9
            if opcode < 8:
                word |= register(operands[1]) << 6 | register(operands[2]) << 3
            elif operands:
                word |= byte(operands[1])
            program.append(Instruction(word, statement, line))
        except ValueError as error:
            raise ValueError(f"Line {line}: {error}") from None
    return tuple(program)


@dataclass(frozen=True)
class Decoded:
    opcode: int
    rd: int
    rs: int
    rt: int
    immediate: int


def decode(word):
    if not 0 <= word <= 0xFFFF:
        raise ValueError("Expected a 16-bit instruction")
    opcode = word >> 12
    if opcode not in MNEMONICS:
        raise ValueError(f"Illegal opcode 0x{opcode:X}")
    reserved = 0x7 if opcode < 8 else 0xFFF if opcode == 15 else 0x100
    if word & reserved:
        raise ValueError("Reserved instruction bits must be zero")
    return Decoded(opcode, (word >> 9) & 7, (word >> 6) & 7, (word >> 3) & 7, word & 255)
