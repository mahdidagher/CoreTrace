class SharedMemory:
    def __init__(self):
        self._bytes = bytearray(256)

    def __getitem__(self, address):
        if not isinstance(address, slice) and not 0 <= address < 256:
            raise IndexError("Memory address must be 0 through 255")
        return self._bytes[address]

    def __setitem__(self, address, value):
        if not 0 <= address < 256:
            raise IndexError("Memory address must be 0 through 255")
        self._bytes[address] = value

    def snapshot(self):
        return bytes(self._bytes)


class TickMemoryPort:
    def __init__(self, snapshot, stores):
        self._snapshot = snapshot
        self._stores = stores

    def __getitem__(self, address):
        return self._snapshot[address]

    def __setitem__(self, address, value):
        self._stores.append((address, value))
