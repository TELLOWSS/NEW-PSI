import { randomUUID } from 'crypto';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';

const MAX_REPORT_IMAGES = 2;
const MAX_MMS_IMAGE_BYTES = 200 * 1024;
const REPORT_MESSAGE_LOG_TABLE = 'report_message_logs';

type ReportImagePayload = {
    fileName?: string;
    dataUrl?: string;
    pageLabel?: string;
};

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
        global: {
            headers: (process.env.VITE_PSI_ADMIN_SECRET || process.env.PSI_ADMIN_SECRET)
                ? { 'x-psi-admin-secret': process.env.VITE_PSI_ADMIN_SECRET || process.env.PSI_ADMIN_SECRET || '' }
                : {},
        },
    },
);

const normalizePhone = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeWorkerUuid = (value: unknown) => String(value || '').trim();

function classifyFailureCategory(errorLike: unknown): string {
    const source = String(errorLike || '').toLowerCase();
    if (source.includes('timeout') || source.includes('time out') || source.includes('timed out')) return '타임아웃';
    if (source.includes('auth') || source.includes('인증') || source.includes('forbidden') || source.includes('unauthorized')) return '인증/권한';
    if (source.includes('phone') || source.includes('번호') || source.includes('invalid recipient') || source.includes('recipient')) return '전화번호 오류';
    if (source.includes('quota') || source.includes('limit') || source.includes('rate') || source.includes('429')) return '한도/속도 제한';
    if (source.includes('upload') || source.includes('image') || source.includes('file')) return '이미지 업로드';
    if (source.includes('network') || source.includes('fetch') || source.includes('socket') || source.includes('dns')) return '네트워크';
    return '기타 실패';
}

function resolveSolapiEnv() {
    const apiKey = String(process.env.SOLAPI_API_KEY || process.env.COOLSMS_API_KEY || '').trim();
    const apiSecret = String(process.env.SOLAPI_API_SECRET || process.env.COOLSMS_API_SECRET || '').trim();
    const sender = normalizePhone(process.env.SOLAPI_SENDER || process.env.COOLSMS_SENDER || '');

    if (!apiKey || !apiSecret || !sender) {
        throw new Error('SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER 환경변수를 설정해 주세요.');
    }

    return { apiKey, apiSecret, sender };
}

function isReportMessageLogTableMissing(error: any): boolean {
    const message = String(error?.message || error?.details || '').toLowerCase();
    return message.includes(REPORT_MESSAGE_LOG_TABLE) || message.includes('relation') && message.includes('does not exist');
}

function parseImageDataUrl(dataUrl: string) {
    const match = String(dataUrl || '').match(/^data:(image\/jpeg|image\/jpg);base64,(.+)$/i);
    if (!match) {
        throw new Error('문자 발송용 이미지는 JPG 형식이어야 합니다.');
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) {
        throw new Error('문자 발송용 이미지 데이터가 비어 있습니다.');
    }
    if (buffer.length > MAX_MMS_IMAGE_BYTES) {
        throw new Error(`문자 발송용 이미지는 200KB 이하여야 합니다. (현재 ${Math.round(buffer.length / 1024)}KB)`);
    }

    return buffer;
}

function buildPageMessage(options: {
    workerName: string;
    pageIndex: number;
    totalPages: number;
    coverMessage?: string;
    pageLabel?: string;
}) {
    const workerName = String(options.workerName || '근로자').trim() || '근로자';
    const coverMessage = String(options.coverMessage || '').trim();
    const pageLabel = String(options.pageLabel || '').trim() || (options.pageIndex === 0 ? '요약 페이지' : '상세 해설 페이지');

    const lines = [
        `[PSI] ${workerName} 안전 리포트`,
        `${options.pageIndex + 1}/${options.totalPages} · ${pageLabel}`,
    ];

    if (coverMessage) {
        lines.push(coverMessage);
    }

    return lines.join('\n');
}

async function persistPhoneNumber(workerUuid: string, phoneNumber: string) {
    if (!workerUuid || !phoneNumber) {
        return { updated: false, reason: '식별자 없음' };
    }

    try {
        const { error } = await supabase
            .from('workers')
            .update({ phone_number: phoneNumber })
            .eq('id', workerUuid);

        if (error) {
            return { updated: false, reason: error.message || 'workers.phone_number 저장 실패' };
        }

        return { updated: true };
    } catch (error: any) {
        return { updated: false, reason: error?.message || 'workers.phone_number 저장 실패' };
    }
}

async function appendReportMessageLog(payload: {
    workerId?: string;
    workerName: string;
    teamName?: string;
    phoneNumber: string;
    status: 'SUCCESS' | 'FAILED';
    failureCategory?: string | null;
    sentCount: number;
    message: string;
    resultPayload?: unknown;
}) {
    try {
        const { error } = await supabase
            .from(REPORT_MESSAGE_LOG_TABLE)
            .insert({
                worker_id: payload.workerId || null,
                worker_name: payload.workerName,
                team_name: payload.teamName || null,
                phone_number: payload.phoneNumber,
                status: payload.status,
                failure_category: payload.failureCategory || null,
                sent_count: payload.sentCount,
                provider: 'SOLAPI',
                message: payload.message,
                result_payload: payload.resultPayload || {},
                created_by: 'admin-ui',
            });

        if (error && !isReportMessageLogTableMissing(error)) {
            console.warn('[send-report-message] log insert failed:', error.message || error);
        }
    } catch (error) {
        console.warn('[send-report-message] log insert exception:', error);
    }
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    const tempFilePaths: string[] = [];
    let logContext: {
        workerId?: string;
        workerName: string;
        teamName?: string;
        phoneNumber: string;
    } | null = null;

    try {
        const {
            workerName,
            phoneNumber,
            workerUuid,
            teamName,
            coverMessage,
            reportImages,
        } = req.body || {};

        const normalizedPhone = normalizePhone(phoneNumber);
        const normalizedWorkerUuid = normalizeWorkerUuid(workerUuid);
        const safeWorkerName = String(workerName || '').trim() || '근로자';
        const safeTeamName = String(teamName || '').trim();
        const images = (Array.isArray(reportImages) ? reportImages : []).slice(0, MAX_REPORT_IMAGES) as ReportImagePayload[];
        logContext = {
            workerId: normalizedWorkerUuid,
            workerName: safeWorkerName,
            teamName: safeTeamName,
            phoneNumber: normalizedPhone,
        };

        if (!normalizedPhone || normalizedPhone.length < 10) {
            return res.status(400).json({ ok: false, message: '수신자 전화번호를 확인해 주세요.' });
        }
        if (images.length === 0) {
            return res.status(400).json({ ok: false, message: '문자로 보낼 리포트 이미지가 없습니다.' });
        }

        const { apiKey, apiSecret, sender } = resolveSolapiEnv();
        const { SolapiMessageService } = await import('solapi');
        const messageService = new SolapiMessageService(apiKey, apiSecret);
        const sendResults: Array<{ page: number; imageId: string | null; messageId: string | null; groupId: string | null; pageLabel: string; }> = [];

        for (let index = 0; index < images.length; index += 1) {
            const image = images[index];
            const buffer = parseImageDataUrl(String(image?.dataUrl || ''));
            const tempFilePath = join(tmpdir(), `psi-report-${randomUUID()}-${index + 1}.jpg`);
            tempFilePaths.push(tempFilePath);
            await writeFile(tempFilePath, buffer);

            const uploadResponse = await messageService.uploadFile(tempFilePath, 'MMS');
            const imageId = String((uploadResponse as any)?.fileId || '');
            if (!imageId) {
                throw new Error('SOLAPI 이미지 업로드에 실패했습니다.');
            }

            const pageLabel = String(image?.pageLabel || '').trim() || (index === 0 ? '요약 페이지' : '상세 해설 페이지');
            const sendResponse = await messageService.send({
                to: normalizedPhone,
                from: sender,
                text: buildPageMessage({
                    workerName: safeWorkerName,
                    pageIndex: index,
                    totalPages: images.length,
                    coverMessage,
                    pageLabel,
                }),
                subject: `[PSI] ${safeWorkerName} 리포트 ${index + 1}/${images.length}`,
                imageId,
            });

            const firstMessage = Array.isArray((sendResponse as any)?.messageList)
                ? (sendResponse as any).messageList[0]
                : Array.isArray((sendResponse as any)?.messages)
                    ? (sendResponse as any).messages[0]
                    : null;

            sendResults.push({
                page: index + 1,
                imageId,
                messageId: firstMessage?.messageId ? String(firstMessage.messageId) : null,
                groupId: (sendResponse as any)?.groupId ? String((sendResponse as any).groupId) : null,
                pageLabel,
            });
        }

        const phonePersistResult = await persistPhoneNumber(normalizedWorkerUuid, normalizedPhone);

        await appendReportMessageLog({
            workerId: normalizedWorkerUuid,
            workerName: safeWorkerName,
            teamName: safeTeamName,
            phoneNumber: normalizedPhone,
            status: 'SUCCESS',
            failureCategory: null,
            sentCount: sendResults.length,
            message: `${sendResults.length}건 MMS 발송 완료`,
            resultPayload: {
                coverMessage: String(coverMessage || '').trim(),
                results: sendResults,
                phonePersistResult,
            },
        });

        return res.status(200).json({
            ok: true,
            data: {
                workerName: safeWorkerName,
                phoneNumber: normalizedPhone,
                sentCount: sendResults.length,
                results: sendResults,
                phonePersistResult,
            },
        });
    } catch (error: any) {
        console.error('[send-report-message] error:', error);
        if (logContext) {
            await appendReportMessageLog({
                workerId: logContext.workerId,
                workerName: logContext.workerName,
                teamName: logContext.teamName,
                phoneNumber: logContext.phoneNumber,
                status: 'FAILED',
                failureCategory: classifyFailureCategory(error?.message || error),
                sentCount: 0,
                message: error?.message || '리포트 문자 발송 실패',
                resultPayload: {
                    error: error?.message || 'unknown error',
                },
            });
        }
        return res.status(500).json({
            ok: false,
            message: error?.message || '리포트 문자 발송 실패',
        });
    } finally {
        await Promise.all(tempFilePaths.map((filePath) => unlink(filePath).catch(() => undefined)));
    }
}
