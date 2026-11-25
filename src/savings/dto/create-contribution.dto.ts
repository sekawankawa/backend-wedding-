import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateContributionDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Jumlah harus berupa angka" })
  @Min(1, { message: "Jumlah minimal 1" })
  readonly amount: number;

  @IsDateString({}, { message: "Tanggal kontribusi harus berupa tanggal yang valid" })
  readonly contributedAt: string;

  @IsOptional()
  @IsString({ message: "Deskripsi harus berupa teks" })
  @MaxLength(255, { message: "Deskripsi maksimal 255 karakter" })
  readonly description?: string;
}
