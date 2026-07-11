import 'server-only';
import { MAX_FILE_SIZE } from '../shared/constants';
import { ErrorCodes } from '../shared/error-codes';
import crypto from 'crypto';

export class FileValidationService {
  static validateSize(size: number): void {
    if (size > MAX_FILE_SIZE) {
      throw new Error(ErrorCodes.FILE_TOO_LARGE);
    }
  }

  static validateMimeType(mime: string): void {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowed.includes(mime)) {
      throw new Error(ErrorCodes.INVALID_MIME_TYPE);
    }
  }

  static generateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static compareHash(buffer: Buffer, expectedHash: string): boolean {
    const actual = this.generateHash(buffer);
    return actual === expectedHash;
  }
}
