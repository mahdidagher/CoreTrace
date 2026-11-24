def alu(opcode, left, right):
    match opcode:
        case 0: result = left + right
        case 1: result = left - right
        case 2: result = left & right
        case 3: result = left | right
        case 4: result = left ^ right
        case 5: result = ~(left | right)
        case 6: result = left << right
        case 7: result = left >> right
        case _: raise ValueError(f"Invalid ALU opcode {opcode}")
    return result & 255
