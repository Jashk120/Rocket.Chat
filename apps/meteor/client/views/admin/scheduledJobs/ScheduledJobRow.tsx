import { Box } from '@rocket.chat/fuselage';
import { useMediaQuery } from '@rocket.chat/fuselage-hooks';
import { GenericTableCell, GenericTableRow } from '@rocket.chat/ui-client';
import { useRouter } from '@rocket.chat/ui-contexts';
import { useCallback } from 'react';

import { useFormatDate } from '../../../hooks/useFormatDate';

type ScheduledJob = {
	_id: string;
	name: string;
	status: string;
	repeatInterval: string | null;
	nextRunAt: string | null;
	lastRunAt: string | null;
	failCount: number;
};

type StatusConfig = {
	color: string;
	bg: string;
	border: string;
};

const statusConfig: Record<string, StatusConfig> = {
	scheduled: { color: 'blue', bg: 'tint', border: 'light' },
	running:   { color: 'green', bg: 'tint', border: 'light' },
	failed:    { color: 'red', bg: 'tint', border: 'light' },
	stuck:     { color: 'yellow', bg: 'tint', border: 'light' },
	disabled:  { color: 'default', bg: 'tint', border: 'light' },
	completed: { color: 'purple', bg: 'tint', border: 'light' },
};

// Dot color per status using inline style — Fuselage tokens don't cover all these
const dotColor: Record<string, string> = {
	scheduled: '#4a9eff',
	running:   '#22c55e',
	failed:    '#ef4444',
	stuck:     '#f59e0b',
	disabled:  '#64748b',
	completed: '#a78bfa',
};

const badgeBg: Record<string, string> = {
	scheduled: 'rgba(74,158,255,0.10)',
	running:   'rgba(34,197,94,0.10)',
	failed:    'rgba(239,68,68,0.10)',
	stuck:     'rgba(245,158,11,0.10)',
	disabled:  'rgba(100,116,139,0.10)',
	completed: 'rgba(167,139,250,0.10)',
};

const badgeBorder: Record<string, string> = {
	scheduled: 'rgba(74,158,255,0.25)',
	running:   'rgba(34,197,94,0.25)',
	failed:    'rgba(239,68,68,0.25)',
	stuck:     'rgba(245,158,11,0.25)',
	disabled:  'rgba(100,116,139,0.20)',
	completed: 'rgba(167,139,250,0.25)',
};

const badgeText: Record<string, string> = {
	scheduled: '#4a9eff',
	running:   '#22c55e',
	failed:    '#ef4444',
	stuck:     '#f59e0b',
	disabled:  '#64748b',
	completed: '#a78bfa',
};

/**
 * Converts a 5-part cron expression to a short human label.
 */
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

const StatusBadge = ({ status }: { status: string }) => (
	<Box
		display='flex'
		alignItems='center'
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			gap: '6px',
			padding: '2px 8px',
			borderRadius: '6px',
			background: badgeBg[status] ?? 'rgba(100,116,139,0.10)',
			border: `1px solid ${badgeBorder[status] ?? 'rgba(100,116,139,0.20)'}`,
			color: badgeText[status] ?? '#64748b',
			fontSize: '11px',
			fontFamily: 'monospace',
			fontWeight: 500,
			whiteSpace: 'nowrap',
		}}
	>
		<span
			style={{
				width: '5px',
				height: '5px',
				borderRadius: '50%',
				background: dotColor[status] ?? '#64748b',
				flexShrink: 0,
			}}
		/>
		{status}
	</Box>
);

const IntervalChip = ({ value }: { value: string | null }) => {
	if (!value) {
		return (
			<Box color='hint' fontScale='p2' style={{ textAlign: 'center' }}>
				—
			</Box>
		);
	}

	const human = parseCron(value);

	return (
		<span
			title={value}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: '6px',
				cursor: 'default',
				height: '20px',
			}}
		>
			<span
				style={{
					fontSize: '12px',
					color: '#cbd5e1',
					fontWeight: 500,
					lineHeight: '20px',
					width: '100px',
					display: 'inline-block',
				}}
			>
				{human ?? value}
			</span>
			{human && (
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						height: '16px',
						padding: '0 4px',
						borderRadius: '4px',
						background: 'rgba(255,255,255,0.04)',
						border: '1px solid rgba(255,255,255,0.08)',
						fontSize: '9px',
						fontFamily: 'monospace',
						fontWeight: 600,
						color: '#475569',
						lineHeight: 1,
						flexShrink: 0,
					}}
				>
					cron
				</span>
			)}
		</span>
	);
};

const DateCell = ({ value, formatter }: { value: string | null; formatter: (d: string) => string }) => {
	if (!value) {
		return (
			<Box color='hint' fontScale='p2'>
				—
			</Box>
		);
	}
	return (
		<Box
			fontScale='p2'
			color='secondary-info'
			style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}
		>
			{formatter(value)}
		</Box>
	);
};

const FailCount = ({ count }: { count: number }) => {
	if (count === 0) {
		return (
			<Box color='hint' fontScale='p2'>
				—
			</Box>
		);
	}
	return (
		<Box
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
				fontSize: '10px',
				fontWeight: 700,
				fontVariantNumeric: 'tabular-nums',
			}}
		>
			{count}
		</Box>
	);
};

const ScheduledJobRow = ({ job }: { job: ScheduledJob }) => {
	const mediaQuery = useMediaQuery('(min-width: 1024px)');
	const router = useRouter();
	const formatDate = useFormatDate();

  const onClick = useCallback(
    (id: string) => (): void =>
        router.navigate(`/admin/scheduled-jobs/edit/${id}` as any),
    [router],
    );
	return (
		<GenericTableRow
			action
			key={job._id}
			onClick={onClick(job._id)}
			onKeyDown={onClick(job._id)}
			tabIndex={0}
			role='link'
		>
			<GenericTableCell withTruncatedText>
				<Box
					fontScale='p2m'
					withTruncatedText
					style={{
						fontFamily: 'monospace',
						fontSize: '12.5px',
						color: '#e2e8f0',
						letterSpacing: '-0.01em',
					}}
				>
					{job.name}
				</Box>
			</GenericTableCell>

			<GenericTableCell>
				<StatusBadge status={job.status} />
			</GenericTableCell>

			<GenericTableCell>
				<IntervalChip value={job.repeatInterval} />
			</GenericTableCell>

			{mediaQuery && (
				<GenericTableCell>
					<DateCell value={job.nextRunAt} formatter={formatDate} />
				</GenericTableCell>
			)}

			{mediaQuery && (
				<GenericTableCell>
					<DateCell value={job.lastRunAt} formatter={formatDate} />
				</GenericTableCell>
			)}

			{mediaQuery && (
				<GenericTableCell>
					<FailCount count={job.failCount} />
				</GenericTableCell>
			)}
		</GenericTableRow>
	);
};

export default ScheduledJobRow;