import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { rm } from 'node:fs/promises';
import { DataSource, Repository } from 'typeorm';
import { DealStatus, NeedStatus, ReceiptValidation } from '../common/enums/index.js';
import { Deal } from '../deals/entities/deal.entity.js';
import { Vendor } from '../vendors/entities/vendor.entity.js';
import { PlanNeed } from '../plans/entities/plan-need.entity.js';
import { PlansService } from '../plans/plans.service.js';
import type { ConfirmReceiptDto } from './dto/confirm-receipt.dto.js';
import type { CreateDocumentTaskDto } from './dto/create-document-task.dto.js';
import type { UpdateDocumentTaskDto } from './dto/update-document-task.dto.js';
import type { UploadReceiptDto } from './dto/upload-receipt.dto.js';
import type { UploadDocumentScanDto } from './dto/upload-document-scan.dto.js';
import type { ValidateReceiptDto } from './dto/validate-receipt.dto.js';
import { DocumentTask } from './entities/document-task.entity.js';
import { Receipt } from './entities/receipt.entity.js';
import { DocumentScan } from './entities/document-scan.entity.js';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentTask) private readonly tasks: Repository<DocumentTask>,
    @InjectRepository(Receipt) private readonly receipts: Repository<Receipt>,
    @InjectRepository(DocumentScan) private readonly scans: Repository<DocumentScan>,
    @InjectRepository(PlanNeed) private readonly needs: Repository<PlanNeed>,
    @InjectRepository(Deal) private readonly deals: Repository<Deal>,
    @InjectRepository(Vendor) private readonly vendors: Repository<Vendor>,
    private readonly plansService: PlansService,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------- checklist berkas

  async createTask(userId: string, dto: CreateDocumentTaskDto) {
    await this.plansService.assertMember(userId, dto.planId);
    return this.tasks.save(
      this.tasks.create({
        planId: dto.planId,
        title: dto.title,
        description: dto.description ?? null,
        dueDate: dto.dueDate ?? null,
      }),
    );
  }

  async listTasks(userId: string, planId: string) {
    await this.plansService.assertMember(userId, planId);
    const tasks = await this.tasks.find({
      where: { planId },
      relations: { scans: true },
      order: { isDone: 'ASC', dueDate: 'ASC' },
    });
    return tasks.map((task) => ({
      id: task.id,
      planId: task.planId,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      isDone: task.isDone,
      completedAt: task.completedAt,
      scans: (task.scans ?? []).map((scan) => ({
        id: scan.id,
        pageNumber: scan.pageNumber,
        createdAt: scan.createdAt,
      })),
    }));
  }

  async uploadDocumentScan(
    userId: string,
    dto: UploadDocumentScanDto,
    file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File gambar (jpg, png, webp; maks 5 MB) wajib diunggah');
    try {
      const task = await this.findTask(userId, dto.taskId);
      const scan = await this.scans.save(
        this.scans.create({
          taskId: task.id,
          imagePath: file.path,
          pageNumber: dto.pageNumber,
        }),
      );
      task.isDone = true;
      task.completedAt = new Date();
      await this.tasks.save(task);
      return {
        id: scan.id,
        taskId: scan.taskId,
        pageNumber: scan.pageNumber,
        createdAt: scan.createdAt,
        ocrStatus: 'not_configured',
      };
    } catch (err) {
      await rm(file.path, { force: true });
      throw err;
    }
  }

  async updateTask(userId: string, id: string, dto: UpdateDocumentTaskDto) {
    const task = await this.findTask(userId, id);
    const { isDone, ...fields } = dto;
    Object.assign(task, fields);
    if (isDone !== undefined && isDone !== task.isDone) {
      task.isDone = isDone;
      task.completedAt = isDone ? new Date() : null;
    }
    return this.tasks.save(task);
  }

  async removeTask(userId: string, id: string) {
    await this.tasks.remove(await this.findTask(userId, id));
  }

  private async findTask(userId: string, id: string) {
    const task = await this.tasks.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Tugas berkas tidak ditemukan');
    await this.plansService.assertMember(userId, task.planId);
    return task;
  }

  // ---------------------------------------------------------------- bukti transaksi

  async uploadReceipt(userId: string, dto: UploadReceiptDto, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('File gambar (jpg, png, webp; maks 5 MB) wajib diunggah');

    try {
      const need = await this.needs.findOne({ where: { id: dto.planNeedId } });
      if (!need) throw new NotFoundException('Kebutuhan tidak ditemukan');
      await this.plansService.assertMember(userId, need.planId);

      if (dto.dealId && !(await this.deals.exists({ where: { id: dto.dealId, planNeedId: need.id } }))) {
        throw new BadRequestException('Kesepakatan tidak cocok dengan kebutuhan ini');
      }
      // OCR belum dihubungkan: kolom ocr_* dibiarkan kosong, user mengisi manual lewat /confirm
      const receipt = await this.receipts.save(
        this.receipts.create({
          planNeedId: need.id,
          dealId: dto.dealId ?? null,
          uploadedById: userId,
          imagePath: file.path,
        }),
      );
      return {
        id: receipt.id,
        planNeedId: receipt.planNeedId,
        dealId: receipt.dealId,
        isConfirmed: receipt.isConfirmed,
        validationStatus: receipt.validationStatus,
        ocrStatus: 'not_configured',
        createdAt: receipt.createdAt,
      };
    } catch (err) {
      await rm(file.path, { force: true }); // jangan tinggalkan file yatim
      throw err;
    }
  }

  async listReceipts(userId: string, planId: string) {
    await this.plansService.assertMember(userId, planId);
    const receipts = await this.receipts
      .createQueryBuilder('r')
      .innerJoin('r.planNeed', 'n')
      .where('n.planId = :planId', { planId })
      .orderBy('r.createdAt', 'DESC')
      .getMany();
    return receipts.map((receipt) => ({
      id: receipt.id,
      planNeedId: receipt.planNeedId,
      dealId: receipt.dealId,
      amount: receipt.amount,
      transactionDate: receipt.transactionDate,
      recipientName: receipt.recipientName,
      ocrRawText: receipt.ocrRawText,
      ocrAmount: receipt.ocrAmount,
      ocrDate: receipt.ocrDate,
      ocrRecipient: receipt.ocrRecipient,
      isConfirmed: receipt.isConfirmed,
      validationStatus: receipt.validationStatus,
      validationNote: receipt.validationNote,
      validatedAt: receipt.validatedAt,
      createdAt: receipt.createdAt,
    }));
  }

  async listVendorReceipts(vendorUserId: string) {
    const vendor = await this.vendors.findOne({ where: { userId: vendorUserId } });
    if (!vendor) throw new NotFoundException('Profil vendor tidak ditemukan');

    const receipts = await this.receipts
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.deal', 'd')
      .innerJoinAndSelect('r.planNeed', 'n')
      .innerJoinAndSelect('n.plan', 'p')
      .innerJoinAndSelect('r.uploadedBy', 'u')
      .where('d.vendorId = :vendorId', { vendorId: vendor.id })
      .orderBy('r.createdAt', 'DESC')
      .getMany();

    return receipts.map((receipt) => ({
      id: receipt.id,
      dealId: receipt.dealId,
      planNeedId: receipt.planNeedId,
      planTitle: receipt.planNeed.plan.title,
      needStatus: receipt.planNeed.status,
      uploadedBy: {
        id: receipt.uploadedBy.id,
        name: receipt.uploadedBy.name,
      },
      amount: receipt.amount,
      transactionDate: receipt.transactionDate,
      recipientName: receipt.recipientName,
      ocrRawText: receipt.ocrRawText,
      ocrAmount: receipt.ocrAmount,
      ocrDate: receipt.ocrDate,
      ocrRecipient: receipt.ocrRecipient,
      isConfirmed: receipt.isConfirmed,
      validationStatus: receipt.validationStatus,
      validationNote: receipt.validationNote,
      createdAt: receipt.createdAt,
    }));
  }

  async validateReceipt(vendorUserId: string, id: string, dto: ValidateReceiptDto) {
    const vendor = await this.vendors.findOne({ where: { userId: vendorUserId } });
    if (!vendor) throw new NotFoundException('Profil vendor tidak ditemukan');

    const receipt = await this.receipts.findOne({
      where: { id },
      relations: { deal: true, planNeed: true },
    });
    if (!receipt || !receipt.deal || receipt.deal.vendorId !== vendor.id) {
      throw new NotFoundException('Bukti transaksi tidak ditemukan');
    }
    if (!receipt.isConfirmed) {
      throw new ConflictException('Pengguna belum mengonfirmasi data bukti transaksi');
    }
    if (receipt.validationStatus !== ReceiptValidation.PENDING) {
      throw new ConflictException('Bukti transaksi sudah divalidasi');
    }

    receipt.validationStatus = dto.status;
    receipt.validationNote = dto.note ?? null;
    receipt.validatedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Receipt, receipt);
      if (dto.status === ReceiptValidation.VALID) {
        await manager.update(Deal, receipt.dealId!, {
          status: DealStatus.CONFIRMED,
          confirmedAt: receipt.validatedAt,
        });
      }
    });

    return {
      id: receipt.id,
      validationStatus: receipt.validationStatus,
      validationNote: receipt.validationNote,
      validatedAt: receipt.validatedAt,
      dealStatus: dto.status === ReceiptValidation.VALID
          ? DealStatus.CONFIRMED
          : receipt.deal.status,
    };
  }

  async getVendorReceiptFile(vendorUserId: string, id: string) {
    const vendor = await this.vendors.findOne({ where: { userId: vendorUserId } });
    if (!vendor) throw new NotFoundException('Profil vendor tidak ditemukan');

    const receipt = await this.receipts.findOne({
      where: { id },
      relations: { deal: true },
    });
    if (!receipt || !receipt.deal || receipt.deal.vendorId !== vendor.id) {
      throw new NotFoundException('Bukti transaksi tidak ditemukan');
    }
    const extension = receipt.imagePath.toLowerCase().split('.').pop();
    const mimeType = extension === 'png'
        ? 'image/png'
        : extension === 'webp'
            ? 'image/webp'
            : 'image/jpeg';
    return { path: receipt.imagePath, mimeType };
  }

  /** User mengoreksi hasil bacaan lalu mengonfirmasi. Jika kebutuhan sudah disepakati, statusnya naik jadi bukti_terunggah. */
  async confirmReceipt(userId: string, id: string, dto: ConfirmReceiptDto) {
    const receipt = await this.receipts.findOne({ where: { id }, relations: { planNeed: true } });
    if (!receipt) throw new NotFoundException('Bukti transaksi tidak ditemukan');
    await this.plansService.assertMember(userId, receipt.planNeed.planId);
    if (receipt.isConfirmed) throw new ConflictException('Bukti transaksi sudah dikonfirmasi');

    await this.dataSource.transaction(async (m) => {
      await m.update(Receipt, id, {
        amount: dto.amount,
        transactionDate: dto.transactionDate,
        recipientName: dto.recipientName,
        isConfirmed: true,
      });
      if (receipt.planNeed.status === NeedStatus.DISEPAKATI) {
        await m.update(PlanNeed, receipt.planNeed.id, { status: NeedStatus.BUKTI_TERUNGGAH });
      }
    });
    return this.receipts.findOneOrFail({ where: { id } });
  }
}