export class DocumentFieldNormalizer {
  static normalizePlate(plate: string | null): string | null {
    if (!plate) return null;
    const clean = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 7) return null;
    return clean;
  }

  static normalizeRenavam(renavam: string | null): string | null {
    if (!renavam) return null;
    const clean = renavam.replace(/[^\d]/g, '');
    if (clean.length < 9 || clean.length > 11) return null;
    return clean.padStart(11, '0');
  }

  static normalizeChassis(chassis: string | null): string | null {
    if (!chassis) return null;
    const clean = chassis.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // I, O, Q are generally forbidden but let validator handle that
    if (clean.length !== 17) return null;
    return clean;
  }

  static normalizeYear(year: string | null): string | null {
    if (!year) return null;
    const clean = year.replace(/[^\d]/g, '');
    if (clean.length === 4) return clean;
    if (clean.length > 4) {
      // some OCR captures "20242024"
      const match = clean.match(/^(19|20)\d{2}/);
      if (match) return match[0];
    }
    return null;
  }

  static normalizeCpfCnpj(doc: string | null): string | null {
    if (!doc) return null;
    const clean = doc.replace(/[^\d]/g, '');
    if (clean.length === 11 || clean.length === 14) return clean;
    return null;
  }

  static normalizeDate(dateStr: string | null): string | null {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return null;
  }
}
