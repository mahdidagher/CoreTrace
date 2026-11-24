DEMO = (
    """# Core 0: generate 1 and 2, then publish 2
NOR R1, R0, R0
SUB R2, R0, R1
ADD R3, R2, R2
STORE R3, 0x20
HALT
""",
    """# Core 1: compute 1, then read before and after commit
NOR R1, R0, R0
SUB R2, R0, R1
OR R3, R2, R0
LOAD R4, 0x20
LOAD R5, 0x20
HALT
""",
)
