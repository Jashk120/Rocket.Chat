import { Tabs, TabsItem } from '@rocket.chat/fuselage';
import { useDebouncedValue, useEffectEvent } from '@rocket.chat/fuselage-hooks';
import { ContextualbarDialog, Page, PageHeader, PageContent } from '@rocket.chat/ui-client';
import { useRouteParameter, useRouter, useEndpoint } from '@rocket.chat/ui-contexts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import EditScheduledJobWithData from './EditScheduledJobWithData';
import ScheduledJobsFilters from './ScheduledJobsFilters';
import ScheduledJobsTable from './ScheduledJobsTable';

export type JobStatus = 'failed' | 'disabled' | 'completed';
export type Tab = 'all' | JobStatus;
type ScheduledJobsFiltersType = {
	text: string;
	source: string;
};

const ScheduledJobsPage = (): ReactElement => {
	const { t } = useTranslation();
	const router = useRouter();
	const context = useRouteParameter('context');
	const id = useRouteParameter('id');
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<Tab>('all');
	const [filters, setFilters] = useState<ScheduledJobsFiltersType>({ text: '', source: 'all' });

	const searchTerm = useDebouncedValue(filters.text, 500);

	const getJobs = useEndpoint('GET', '/v1/jobs' as any, {} as any) as any;

	// Fetch counts only — count: '0' returns total without loading job data
	const { data: failedData } = useQuery({
		queryKey: ['jobs', 'failed', 'count'],
		queryFn: () => getJobs({ status: 'failed', count: '1', offset: '0' }),
	});

	const { data: stuckData } = useQuery({
		queryKey: ['jobs', 'stuck', 'count'],
		queryFn: () => getJobs({ status: 'stuck', count: '1', offset: '0' }),
	});

	const { data: disabledData } = useQuery({
		queryKey: ['jobs', 'disabled', 'count'],
		queryFn: () => getJobs({ status: 'disabled', count: '1', offset: '0' }),
	});

	const failedCount = failedData?.total ?? 0;
	const stuckCount = stuckData?.total ?? 0;
	const disabledCount = disabledData?.total ?? 0;

	const handleCloseContextualbar = useEffectEvent(() =>
		router.navigate('/admin/scheduled-jobs'),
	);

	const handleReload = () => {
		queryClient.invalidateQueries({ queryKey: ['jobs'] });
	};

	return (
		<Page flexDirection='row'>
			<Page>
				<PageHeader title={t('Scheduled Jobs')} />
				<Tabs>
					<TabsItem selected={tab === 'all'} onClick={() => setTab('all')}>{t('All')}</TabsItem>
					
					<TabsItem selected={tab === 'failed'} onClick={() => setTab('failed')}>
						{t('Failed')}{failedCount > 0 && ` (${failedCount})`}
					</TabsItem>
					<TabsItem selected={tab === 'disabled'} onClick={() => setTab('disabled')}>
						{t('Disabled')}{disabledCount > 0 && ` (${disabledCount})`}
					</TabsItem>
					<TabsItem selected={tab === 'completed'} onClick={() => setTab('completed')}>{t('Completed')}</TabsItem>
					</Tabs>
				<PageContent>
					<ScheduledJobsFilters setFilters={setFilters} />
					<ScheduledJobsTable
						status={tab === 'all' ? undefined : tab}
						search={searchTerm}
						source={filters.source === 'all' ? undefined : filters.source}
						onReload={handleReload}
					/>
				</PageContent>
			</Page>
			{context === 'edit' && (
				<ContextualbarDialog onClose={handleCloseContextualbar}>
					<EditScheduledJobWithData
						id={id}
						onClose={handleCloseContextualbar}
						onReload={handleReload}
					/>
				</ContextualbarDialog>
			)}
		</Page>
	);
};

export default ScheduledJobsPage;
