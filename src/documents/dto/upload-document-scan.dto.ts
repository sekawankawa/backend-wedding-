import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class UploadDocumentScanDto {
  @IsUUID('all', { message: 'ID tugas dokumen harus berupa UUID yang valid' })
  readonly taskId: string;

  @Type(() => Number)
  @IsInt({ message: 'Nomor halaman harus berupa angka bulat' })
  @Min(1, { message: 'Nomor halaman minimal 1' })
  readonly pageNumber: number;
}
