/** Limpia el id que da el navegador y deja solo el nombre del mando. */
export function friendlyName(id) {
  let name = id;
  // Chrome, Brave, Edge: "Nombre (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"
  name = name.replace(/\s*\((?:STANDARD GAMEPAD\s*)?Vendor:.*\)\s*$/i, '');
  // Firefox: "054c-0ce6-Nombre"
  name = name.replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '');
  return name.trim() || id;   // si algo sale vacío, devolvemos el id original
}

/** Habla con el mando mediante la Gamepad API del navegador. */
export class GamepadReader {
  #index = null;   // índice del mando elegido; null = ninguno

  /** Busca un mando conectado. Devuelve true si lo encuentra. */
  detect() {
    for (const pad of navigator.getGamepads()) {
      if (pad && pad.connected) {
        this.#index = pad.index;
        return true;
      }
    }
    this.#index = null;
    return false;
  }

  #pad() {
    return this.#index === null ? null : navigator.getGamepads()[this.#index];
  }

  /** Nombre que el navegador da al mando (puede variar según el sistema). */
  name() {
    const pad = this.#pad();
    return pad ? friendlyName(pad.id) : 'Sin mando';
  }

  /** 'standard' si el navegador ya traduce el mando al formato estándar. */
  mapping() {
    return this.#pad()?.mapping ?? '';
  }

  /** Lee los 4 ejes. Devuelve null si no hay mando o la lectura falla. */
  read(timeMs) {
    const pad = this.#pad();
    if (!pad || !pad.connected || pad.axes.length < 4) return null;
    return {
      timeMs,
      lx: pad.axes[0], ly: pad.axes[1],
      rx: pad.axes[2], ry: pad.axes[3],
    };
  }
}