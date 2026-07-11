export class DocumentFieldValidator {
  static validatePlate(plate: string | null): boolean {
    if (!plate) return false;
    // Format: AAA1111 or AAA1A11
    return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate);
  }

  static validateRenavam(renavam: string | null): boolean {
    if (!renavam) return false;
    if (!/^\d{11}$/.test(renavam)) return false;
    // Basic modulus 11 validation could be added here
    return true;
  }

  static validateChassis(chassis: string | null): boolean {
    if (!chassis) return false;
    if (chassis.length !== 17) return false;
    // I, O, Q are not allowed in VIN
    if (/[IOQ]/.test(chassis)) return false;
    return /^[A-Z0-9]{17}$/.test(chassis);
  }

  static validateYear(year: string | null): boolean {
    if (!year) return false;
    const y = parseInt(year, 10);
    const current = new Date().getFullYear();
    return y >= 1950 && y <= current + 2;
  }

  static validateCpfCnpj(doc: string | null): boolean {
    if (!doc) return false;
    return doc.length === 11 || doc.length === 14;
  }
}
