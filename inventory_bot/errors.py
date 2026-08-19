from __future__ import annotations


class InventoryError(Exception):
    user_message = "Ha ocurrido un error con el inventario."

    def __init__(self, user_message: str | None = None) -> None:
        if user_message is not None:
            self.user_message = user_message
        super().__init__(self.user_message)


class InventoryAlreadyExistsError(InventoryError):
    user_message = "⚠️ Este canal ya tiene un inventario."


class InventoryNotFoundError(InventoryError):
    user_message = "⚠️ Este canal todavía no tiene inventario. Un responsable debe usar `/inventario` primero."


class ItemAlreadyExistsError(InventoryError):
    def __init__(self, item_id: int) -> None:
        super().__init__(f"⚠️ Ya existe un objeto con ID {item_id} en este inventario.")


class ItemNotFoundError(InventoryError):
    def __init__(self, item_id: int) -> None:
        super().__init__(f"⚠️ No existe ningún objeto con ID {item_id} en este inventario.")


class InsufficientQuantityError(InventoryError):
    def __init__(self, available: int) -> None:
        super().__init__(f"❌ No hay suficiente cantidad. Disponible: {available}.")


class InventoryMessageMissingError(InventoryError):
    user_message = "⚠️ No encuentro el mensaje permanente. Usa `/recrear_inventario` para publicarlo de nuevo."

