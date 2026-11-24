class RegisterFile:
    def __init__(self):
        self._values = bytearray(8)

    def __iter__(self):
        return iter(self._values)

    def __getitem__(self, index):
        if not 0 <= index < 8:
            raise IndexError("Register index must be 0 through 7")
        return self._values[index]

    def __setitem__(self, index, value):
        if not 0 <= index < 8:
            raise IndexError("Register index must be 0 through 7")
        self._values[index] = value
