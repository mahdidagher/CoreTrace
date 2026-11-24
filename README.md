# CoreTrace

CoreTrace is an animated dual-core CPU simulator for CCEE 324 Computer Organization. It shows how each instruction moves through the datapath and how the two cores communicate through shared memory.

## Run locally

Requires Python 3.10 or newer. The website uses only the Python standard library.

```sh
python website.py
```

On Windows, you can also run `Launch Website.cmd`. Keep the server terminal open and visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

- **Instruction** lets you select an opcode, edit the operands, and watch animated pulses follow the circuit through fetch, decode, execute, and commit.
- **Programs** lets you assemble one program per core and play back both cores on a shared clock. The demo shows a store becoming visible on the following clock.

Run `python harness.py verify` to verify the processor. See the [technical report](Technical%20Report.md) for the architecture and instruction encoding. The optional desktop interface runs with `python simulator.py` and requires Tkinter.
