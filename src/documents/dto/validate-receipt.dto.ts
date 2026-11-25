import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReceiptValidation } from '../../common/enums/index.js';

export class ValidateReceiptDto {
  @IsEnum(ReceiptValidation, { message: 'Status validasi tidak valid' })
  readonly status: ReceiptValidation.VALID | ReceiptValidation.REJECTED;

  @IsOptional()
  @IsString({ message: 'Catatan validasi harus berupa teks' })
  @MaxLength(1000, { message: 'Catatan maksimal 1000 karakter' })
  readonly note?: string;
}
