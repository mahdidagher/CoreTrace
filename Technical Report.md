# CCEE 324 · Dual-Core Processor Simulator

## Website

On Windows, run `Launch Website.cmd` or start the server with `python website.py`, then open http://127.0.0.1:8000. The website reuses the Python processor and renders the controls, live datapath, register files, shared memory, and trace on one page. **Instruction** mode lets you choose an opcode, edit the operands, select a core, and execute one instruction with configurable starting values. **Programs** mode lets you assemble and step through both programs from zero-initialized state.

## Desktop launch and live demonstration

On Windows, double-click `Launch Simulator.cmd`. You can also run `python simulator.py` from this folder with Python 3.10 or newer and Tkinter. No third-party packages are required. The two program editors start with a sample already assembled. Use **Step Clock** to advance one clock, **Run** to advance every half second, and **Pause** to stop automatic stepping. Edit either program and select **Assemble / Reset** to assemble both active programs and clear the previous machine state. Select **Single core** to execute Core 0's program by itself.

For the in-person demonstration, first select **Single core** and step through Core 0's program. Show the highlighted instruction, its machine word, the register file, and the memory write. Clear **Single core** to reset into dual-core mode. Step through clocks 3–6 and compare the two copies of R3. At clock 4, watch Core 1 read the old byte as Core 0 buffers the store. At clock 5, watch Core 1 read the committed byte. Point out that Core 1 executes again after Core 0 has halted.

## Architecture and datapath

Select **Circuit View** to open the animated datapath schematic. The solid teal arrows show active data transfers, and dashed gold arrows show asserted control signals for the last clock. The circuit window has its own clock controls for presenting the simulation.

```text
CORE 0                                           CORE 1
PC → Program 0 → Decoder → Control               PC → Program 1 → Decoder → Control
↑                  │          │                  ↑                  │          │
└──── PC + 1 / hold │          │                  └──── PC + 1 / hold │          │
                    ▼          ▼                                      ▼          ▼
                 Registers ↔ ALU                                  Registers ↔ ALU
                    ↕                                                 ↕
                    └────────── Shared data memory (256 × 8) ──────────┘
```

The assembler converts each editor's source into a separate sequence of 16-bit instruction words. Each active core uses its PC as an instruction index, fetches one word, decodes its fields, and executes it during one simulated clock. The PC starts at zero and increments by one instruction. HALT holds the PC and stops that core. Reaching the end of a program also stops scheduling that core. The model uses a single instruction per core per clock, with no pipeline.

A core has eight independent, writable 8-bit registers, including R0. For a register-format instruction, the register file provides two operands to the ALU and receives the result. For LOAD, the register receives a byte from shared memory. STORE sends a register byte to memory. Reset initializes all registers and all shared memory to zero.

Each clock takes a snapshot of shared memory. Both cores read that snapshot and buffer their stores. At the end of the clock, stores commit in Core 0 then Core 1 order. Any load during a store's clock sees the old value, and the following clock sees the committed value. Core 1 wins same-address store conflicts. The two PCs are separate state variables even when their values happen to match.

## Instruction formats

Bits are numbered from 15 (most significant) to 0. The assignment's final specification gives 8-bit registers and 16-bit instructions. The design follows those widths.

| Format | 15–12 | 11–9 | 8–6 | 5–3 | 2–0 |
|---|---|---|---|---|---|
| ALU | Opcode | Rd | Rs | Rt | 000 |

| Format | 15–12 | 11–9 | 8 | 7–0 |
|---|---|---|---|---|
| LOAD / STORE | Opcode | Register | 0 | Address byte |
| HALT | 1111 | 000 | 0 | 00000000 |

The store register field identifies the source. Memory addresses range from 0 to 255 and are direct. Operands accept decimal, hexadecimal, or binary bytes. Use R0 through R7, or register aliases such as `$3`. Blank lines and comments starting with `#` or `//` are allowed. LW and SW are aliases for the simplified LOAD and STORE syntax. Shift instructions take their count from a register.

## Instruction set and control unit

| Opcode | Assembly | Operation | Enabled controls |
|---|---|---|---|
| 0 | ADD Rd, Rs, Rt | Rd ← Rs + Rt | ALU, RegWrite |
| 1 | SUB Rd, Rs, Rt | Rd ← Rs − Rt | ALU, RegWrite |
| 2 | AND Rd, Rs, Rt | Rd ← Rs AND Rt | ALU, RegWrite |
| 3 | OR Rd, Rs, Rt | Rd ← Rs OR Rt | ALU, RegWrite |
| 4 | XOR Rd, Rs, Rt | Rd ← Rs XOR Rt | ALU, RegWrite |
| 5 | NOR Rd, Rs, Rt | Rd ← NOT (Rs OR Rt) | ALU, RegWrite |
| 6 | SLL Rd, Rs, Rt | Rd ← Rs shifted left by Rt | ALU, RegWrite |
| 7 | SRL Rd, Rs, Rt | Rd ← Rs shifted right by Rt | ALU, RegWrite |
| 8 | LOAD Rd, address | Rd ← M[address] | MemRead, RegWrite |
| 9 | STORE Rs, address | M[address] ← Rs | MemWrite |
| F | HALT | Hold PC and halt the core | Halt |

The opcode selects the ALU function for instructions 0–7. The ALU masks all results to eight bits, so addition and subtraction wrap modulo 256, NOR complements eight bits, and shifts discard bits that leave the byte. SRL fills with zeros. A shift count of eight or more yields zero. Subtraction can be understood as adding the two's complement of the second operand and keeping the low eight bits. The higher unused opcodes remain reserved.

## Implementation

- `cpu.py` exports the CPU API. The implementation is split into component modules under `dualcore/`.
- `simulator.py` contains the Python desktop interface. It displays the next instruction and its encoded word, the register file of each core, the full shared memory, and the control signals and data changes after each clock.
- `test_cpu.py` verifies all eight ALU operations, instruction encoding and decoding, control signals, invalid input diagnostics, single-core execution, and dual-core memory sharing. Run `python -m unittest -v` to reproduce the seven passing tests.

## Simulation results

The demo uses M[0x20] to pass a result. Values in the table are decimal. The memory column shows the value after each clock completes.

| Clock | Core 0 | Core 1 | M[0x20] |
|---|---|---|---:|
| 1 | R1 ← NOR(0, 0) = 255 | R1 ← NOR(0, 0) = 255 | 0 |
| 2 | R2 ← 0 − 255 = 1 | R2 ← 0 − 255 = 1 | 0 |
| 3 | R3 ← 1 + 1 = 2 | R3 ← 1 OR 0 = 1 | 0 |
| 4 | Store R3 at 0x20 | Load snapshot value 0 into R4 | 2 |
| 5 | HALT at PC 4 | Load committed value 2 into R5 | 2 |
| 6 | Held at PC 4 | HALT at PC 5 | 2 |

The single-core test also writes 255 from R0 to the last memory address, reads it into R7, then verifies that HALT holds the PC. The desktop smoke test exercised manual stepping, automatic execution, assembly errors after editing, demo reload, and single-core mode.

## Assignment reference

CCEE 324 Computer Organization, Fall 2026, *Design and Simulation of a Simplified Dual-Core Processor for Arithmetic and Logical Operations*, pp. 1–5.
