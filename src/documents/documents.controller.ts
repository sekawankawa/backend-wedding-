// documents/documents.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import multer from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/index.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { DocumentsService } from './documents.service.js';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto.js';
import { CreateDocumentTaskDto } from './dto/create-document-task.dto.js';
import { UpdateDocumentTaskDto } from './dto/update-document-task.dto.js';
import { UploadReceiptDto } from './dto/upload-receipt.dto.js';
import { UploadDocumentScanDto } from './dto/upload-document-scan.dto.js';
import { imageUpload } from '../common/utils/upload.js';
import { ValidateReceiptDto } from './dto/validate-receipt.dto.js';

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const directory = './uploads/private/receipts';
    try {
      mkdirSync(directory, { recursive: true });
      cb(null, directory);
    } catch (error) {
      cb(error as Error, directory);
    }
  },
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});

@ApiTags('documents')
@ApiBearerAuth()
@Roles(Role.USER)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ---- checklist berkas administrasi

  @Post('tasks')
  createTask(@CurrentUser() user: AuthUser, @Body() dto: CreateDocumentTaskDto) {
    return this.documentsService.createTask(user.id, dto);
  }

  @Get('tasks')
  listTasks(@CurrentUser() user: AuthUser, @Query('planId', ParseUUIDPipe) planId: string) {
    return this.documentsService.listTasks(user.id, planId);
  }

  @Patch('tasks/:id')
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentTaskDto,
  ) {
    return this.documentsService.updateTask(user.id, id, dto);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  async removeTask(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.documentsService.removeTask(user.id, id);
  }

  // ---- scan dokumen administrasi pernikahan (file privat)
  @Post('scans')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', imageUpload('wedding-documents', true)))
  uploadDocumentScan(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadDocumentScanDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.uploadDocumentScan(user.id, dto, file);
  }

  // ---- arsip bukti transaksi

  @Post('receipts')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: receiptStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
    }),
  )
  uploadReceipt(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadReceiptDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.uploadReceipt(user.id, dto, file);
  }

  @Get('receipts')
  listReceipts(@CurrentUser() user: AuthUser, @Query('planId', ParseUUIDPipe) planId: string) {
    return this.documentsService.listReceipts(user.id, planId);
  }

  // ---- akses vendor: daftar bukti, file privat, dan validasi manual
  @Get('vendor/receipts')
  @Roles(Role.VENDOR)
  listVendorReceipts(@CurrentUser() user: AuthUser) {
    return this.documentsService.listVendorReceipts(user.id);
  }

  @Get('vendor/receipts/:id/file')
  @Roles(Role.VENDOR)
  async getVendorReceiptFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.documentsService.getVendorReceiptFile(user.id, id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', 'inline');
    const stream = createReadStream(file.path);
    stream.on('error', () => {
      if (!response.headersSent) response.status(404).end();
    });
    stream.pipe(response);
  }

  @Patch('vendor/receipts/:id/validate')
  @Roles(Role.VENDOR)
  validateVendorReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateReceiptDto,
  ) {
    return this.documentsService.validateReceipt(user.id, id, dto);
  }

  @Patch('receipts/:id/confirm')
  confirmReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmReceiptDto,
  ) {
    return this.documentsService.confirmReceipt(user.id, id, dto);
  }
}