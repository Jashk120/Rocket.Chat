import {
	Box,
	Button,
	ButtonGroup,
	Field,
	FieldLabel,
	FieldRow,
	FieldHint,
} from '@rocket.chat/fuselage';
import { ContextualbarScrollableContent, ContextualbarFooter } from '@rocket.chat/ui-client';
import { useTranslation } from 'react-i18next';
import { useEndpoint, useToastMessageDispatch } from '@rocket.chat/ui-contexts';
import { useQuery } from '@tanstack/react-query';
import { useEffectEvent } from '@rocket.chat/fuselage-hooks';
import { useQueryClient } from '@tanstack/react-query';


type ScheduledJob = {
	_id: string;
	name: string;
	status: string;
	repeatInterval: string | null;
	nextRunAt: string | null;
	lastRunAt: string | null;
	failCount: number;
	failReason: string | null;
	disabled: boolean;
	source?: string;
};

type EditScheduledJobProps = {
	job: ScheduledJob;
	onClose: () => void;
};

const dotColor: Record<string, string> = {
	scheduled: '#4a9eff',
	running: '#22c55e',
	failed: '#ef4444',
	stuck: '#f59e0b',
	disabled: '#64748b',
	completed: '#a78bfa',
};

const badgeBg: Record<string, string> = {
	scheduled: 'rgba(74,158,255,0.10)',
	running: 'rgba(34,197,94,0.10)',
	failed: 'rgba(239,68,68,0.10)',
	stuck: 'rgba(245,158,11,0.10)',
	disabled: 'rgba(100,116,139,0.10)',
	completed: 'rgba(167,139,250,0.10)',
};

const badgeBorder: Record<string, string> = {
	scheduled: 'rgba(74,158,255,0.25)',
	running: 'rgba(34,197,94,0.25)',
	failed: 'rgba(239,68,68,0.25)',
	stuck: 'rgba(245,158,11,0.25)',
	disabled: 'rgba(100,116,139,0.20)',
	completed: 'rgba(167,139,250,0.25)',
};

const badgeText: Record<string, string> = {
	scheduled: '#4a9eff',
	running: '#22c55e',
	failed: '#ef4444',
	stuck: '#f59e0b',
	disabled: '#64748b',
	completed: '#a78bfa',
};

function parseCron(cron: string): string | null {
	const parts = cron.trim().split(/\s+/);
	if (parts.length !== 5) return null;
	const [min, hour, dom, month, dow] = parts;
	if (/^\*\/\d+$/.test(min) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
		return `Every ${min.slice(2)} min`;
	}
	if (/^\*\/\d+$/.test(hour) && dom === '*' && month === '*' && dow === '*') {
		const n = parseInt(hour.slice(2));
		return n === 1 ? 'Every hour' : `Every ${n} hrs`;
	}
	if (/^\d+$/.test(min) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
		return 'Every hour';
	}
	if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && month === '*' && dow === '*') {
		return `Daily ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
	}
	if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && month === '*' && /^\d$/.test(dow)) {
		const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		return `Weekly ${days[parseInt(dow)] ?? dow} ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
	}
	return null;
}

const DUMMY_HISTORY: Record<string, { startedAt: string; result: 'success' | 'failed' }[]> = {
	UserDataDownload: [
		{ startedAt: '2026-03-20T08:54:00Z', result: 'success' },
		{ startedAt: '2026-03-20T08:52:00Z', result: 'success' },
		{ startedAt: '2026-03-20T08:50:00Z', result: 'success' },
		{ startedAt: '2026-03-20T08:48:00Z', result: 'success' },
		{ startedAt: '2026-03-20T08:46:00Z', result: 'success' },
	],
};

const ReadOnlyField = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
	<Field>
		<FieldLabel>{label}</FieldLabel>
		<FieldRow>{children}</FieldRow>
		{hint && <FieldHint>{hint}</FieldHint>}
	</Field>
);

const EditScheduledJob = ({ job, onClose, onReload }: EditScheduledJobProps & { onReload: () => void }) => {
    const { t } = useTranslation();
    const dispatchToastMessage = useToastMessageDispatch();

    const disableJob = useEndpoint('POST', '/v1/jobs/:jobId/disable' as any, { jobId: job._id } as any) as any;
    const enableJob = useEndpoint('POST', '/v1/jobs/:jobId/enable' as any, { jobId: job._id } as any) as any;
    const forceRun = useEndpoint('POST', '/v1/jobs/:jobId/force-run' as any, { jobId: job._id } as any) as any;
    const getHistory = useEndpoint('GET', '/v1/jobs/:jobName/history' as any, { jobName: job.name } as any) as any;
	const queryClient = useQueryClient();

    const { data: historyData } = useQuery({
        queryKey: ['job-history', job.name],
        queryFn: () => getHistory({ jobName: job.name }),
        meta: { apiErrorToastMessage: true },
    });

    const handleDisable = useEffectEvent(async () => {
        try {
            await disableJob({ source: job.source });
            dispatchToastMessage({ type: 'success', message: t('Job disabled') });
            onReload();
        } catch (error) {
            dispatchToastMessage({ type: 'error', message: error });
        }
    });

    const handleEnable = useEffectEvent(async () => {
        try {
            await enableJob({ source: job.source });
            dispatchToastMessage({ type: 'success', message: t('Job enabled') });
            onReload();
        } catch (error) {
            dispatchToastMessage({ type: 'error', message: error });
        }
    });

    const handleForceRun = useEffectEvent(async () => {
        try {
            await forceRun({ source: job.source });
            dispatchToastMessage({ type: 'success', message: t('Job triggered') });
			queryClient.invalidateQueries({ queryKey: ['job-history', job.name] });
			onReload();
        } catch (error) {
            dispatchToastMessage({ type: 'error', message: error });
        }
    });

    const history = historyData?.history ?? null;
    const human = job.repeatInterval ? parseCron(job.repeatInterval) : null;

	return (
		<>
			<ContextualbarScrollableContent>
				{/* Status */}
				<ReadOnlyField label={t('Status')}>
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '6px',
							padding: '2px 8px',
							borderRadius: '6px',
							background: badgeBg[job.status] ?? 'rgba(100,116,139,0.10)',
							border: `1px solid ${badgeBorder[job.status] ?? 'rgba(100,116,139,0.20)'}`,
							color: badgeText[job.status] ?? '#64748b',
							fontSize: '11px',
							fontFamily: 'monospace',
							fontWeight: 500,
						}}
					>
						<span
							style={{
								width: '5px',
								height: '5px',
								borderRadius: '50%',
								background: dotColor[job.status] ?? '#64748b',
								flexShrink: 0,
							}}
						/>
						{job.status}
					</span>
				</ReadOnlyField>

				{/* Repeat interval */}
				{job.repeatInterval && (
                <ReadOnlyField label={t('Repeat interval')} >
                    <Box fontScale='p2' color='default'>
                        {human ?? job.repeatInterval}
                    </Box>
                </ReadOnlyField>
            )}

				{/* Next run */}
				<ReadOnlyField label={t('Next run')}>
					<Box fontScale='p2' color={job.nextRunAt ? 'default' : 'hint'}>
						{job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—'}
					</Box>
				</ReadOnlyField>

				{/* Last run */}
				<ReadOnlyField label={t('Last run')}>
					<Box fontScale='p2' color={job.lastRunAt ? 'default' : 'hint'}>
						{job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : '—'}
					</Box>
				</ReadOnlyField>

				{/* Fail count */}
				<ReadOnlyField label={t('Fails')}>
					{job.failCount > 0 ? (
						<span
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								minWidth: '20px',
								height: '20px',
								padding: '0 6px',
								borderRadius: '6px',
								background: 'rgba(239,68,68,0.10)',
								border: '1px solid rgba(239,68,68,0.25)',
								color: '#ef4444',
								fontSize: '11px',
								fontWeight: 700,
							}}
						>
							{job.failCount}
						</span>
					) : (
						<Box fontScale='p2' color='hint'>
							0
						</Box>
					)}
				</ReadOnlyField>

				{/* Fail reason */}
				{job.failReason && (
					<ReadOnlyField label={t('Fail reason')}>
						<Box
							fontScale='p2'
							style={{
								padding: '8px 10px',
								borderRadius: '6px',
								background: 'rgba(239,68,68,0.06)',
								border: '1px solid rgba(239,68,68,0.15)',
								color: '#fca5a5',
								fontFamily: 'monospace',
								fontSize: '12px',
								wordBreak: 'break-all',
								whiteSpace: 'pre-wrap',
							}}
						>
							{job.failReason}
						</Box>
					</ReadOnlyField>
				)}

				{/* Source */}
				{job.source && (
					<ReadOnlyField label={t('Source')}>
						<Box fontScale='p2' color='hint'>
							{job.source}
						</Box>
					</ReadOnlyField>
				)}

				{/* Execution History */}
				<Field>
					<FieldLabel>{t('Recent executions')}</FieldLabel>
				</Field>
				{history && history.length > 0 ? (
					<Box display='flex' flexDirection='column' style={{ gap: '6px', marginTop: '4px' }}>
						{history.map((entry: any, i: number) => (
							<Box
								key={i}
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									padding: '6px 10px',
									borderRadius: '6px',
									background: 'rgba(255,255,255,0.03)',
									border: '1px solid rgba(255,255,255,0.06)',
								}}
							>
								<Box fontScale='p2' style={{ fontSize: '11px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
									{new Date(entry.startedAt).toLocaleTimeString()}
								</Box>
								<span style={{
									padding: '1px 6px',
									borderRadius: '4px',
									fontSize: '10px',
									fontWeight: 600,
									background: entry.error ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)',
									border: `1px solid ${entry.error ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
									color: entry.error ? '#ef4444' : '#22c55e',
								}}>
									{entry.error ? 'failed' : 'success'}
								</span>
							</Box>
						))}
					</Box>
				) : (
					<Box fontScale='p2' color='hint' style={{ marginTop: '4px', fontSize: '12px' }}>
						{t('No history available')}
					</Box>
				)}
			</ContextualbarScrollableContent>

			<ContextualbarFooter>
				<ButtonGroup stretch>
					{job.disabled ? (
						<Button primary onClick={handleEnable}>
							{t('Enable')}
						</Button>
					) : (
						<Button danger onClick={handleDisable}>
							{t('Disable')}
						</Button>
					)}
					<Button onClick={handleForceRun}>
						{t('Force Run')}
					</Button>
				</ButtonGroup>
				<Box mbs={8}>
					<ButtonGroup stretch>
						<Button onClick={onClose}>{t('Close')}</Button>
					</ButtonGroup>
				</Box>
			</ContextualbarFooter>
		</>
	);
};

export default EditScheduledJob;