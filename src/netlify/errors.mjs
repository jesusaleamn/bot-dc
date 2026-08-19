export class InventoryError extends Error {
  constructor(message = "Ha ocurrido un error con el inventario.") {
    super(message);
    this.name = "InventoryError";
    this.userMessage = message;
  }
}

export class InventoryAlreadyExistsError extends InventoryError {
  constructor() {
    super("⚠️ Este canal ya tiene un inventario.");
  }
}

export class InventoryNotFoundError extends InventoryError {
  constructor() {
    super("⚠️ Este canal todavía no tiene inventario. Un responsable debe usar `/inventario` primero.");
  }
}

export class ItemAlreadyExistsError extends InventoryError {
  constructor(itemId) {
    super(`⚠️ Ya existe un objeto con ID ${itemId} en este inventario.`);
  }
}

export class ItemNotFoundError extends InventoryError {
  constructor(itemId) {
    super(`⚠️ No existe ningún objeto con ID ${itemId} en este inventario.`);
  }
}

export class InsufficientQuantityError extends InventoryError {
  constructor(available) {
    super(`❌ No hay suficiente cantidad. Disponible: ${available}.`);
  }
}

export class InventoryMessageMissingError extends InventoryError {
  constructor() {
    super("⚠️ No encuentro el mensaje permanente. Usa `/recrear_inventario` para publicarlo de nuevo.");
  }
}

