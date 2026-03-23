import { Box, Pagination, States, StatesIcon, StatesTitle, StatesActions, StatesAction } from '@rocket.chat/fuselage';
import { useMediaQuery } from '@rocket.chat/fuselage-hooks';
import {
	GenericTable,
	GenericTableBody,
	GenericTableHeader,
	GenericTableHeaderCell,
	GenericTableLoadingTable,
	usePagination,
	useSort,
} from '@rocket.chat/ui-client';
import { useEndpoint } from '@rocket.chat/ui-contexts';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import ScheduledJobRow from './ScheduledJobRow';
import GenericNoResults from '../../../components/GenericNoResults';
import { JobStatus } from './ScheduledJobsPage';

type SortOption = 'name' | 'nextRunAt' | 'lastRunAt' | 'failCount';

type ScheduledJobsTableProps = {
	status?: JobStatus;
	search?: string;
	source?: string;
	onReload: () => void;
};

const ScheduledJobsTable = ({ status, search, source, onReload }: ScheduledJobsTableProps): ReactElement => {
	const { t } = useTranslation();
	const mediaQuery = useMediaQuery('(min-width: 1024px)');

	const { current, itemsPerPage, setItemsPerPage, setCurrent, ...paginationProps } = usePagination();
	const { sortBy, sortDirection, setSort } = useSort<SortOption>('nextRunAt');

	const getJobs = useEndpoint('GET', '/v1/jobs' as any, {} as any) as any;

	const { data, refetch, isSuccess, isLoading, isError } = useQuery({
		queryKey: ['jobs', status, search, source, sortBy, sortDirection, current, itemsPerPage],
		queryFn: async () =>
			getJobs({
				...(status && { status }),
				...(search && { search }),
				...(source && { source }),
				sortField: sortBy,
				sortOrder: sortDirection,
				count: String(itemsPerPage),
				offset: String(current),
			}),
	});

	const headers = (
		<>
			<GenericTableHeaderCell
				key='name'
				w='x240'
				direction={sortDirection}
				active={sortBy === 'name'}
				onClick={setSort}
				sort='name'
			>
				{t('Name')}
			</GenericTableHeaderCell>
			<GenericTableHeaderCell key='status' w='x120'>
				{t('Status')}
			</GenericTableHeaderCell>
			<GenericTableHeaderCell key='source' w='x120'>
				{t('Source')}
			</GenericTableHeaderCell>
			<GenericTableHeaderCell key='repeatInterval' w='x160'>
				{t('Repeat_Interval')}
			</GenericTableHeaderCell>
			{mediaQuery && (
				<>
					<GenericTableHeaderCell
						key='nextRunAt'
						w='x160'
						direction={sortDirection}
						active={sortBy === 'nextRunAt'}
						onClick={setSort}
						sort='nextRunAt'
					>
						{t('Next_Run')}
					</GenericTableHeaderCell>
					<GenericTableHeaderCell
						key='lastRunAt'
						w='x160'
						direction={sortDirection}
						active={sortBy === 'lastRunAt'}
						onClick={setSort}
						sort='lastRunAt'
					>
						{t('Last_Run')}
					</GenericTableHeaderCell>
					<GenericTableHeaderCell
						key='failCount'
						w='x80'
						direction={sortDirection}
						active={sortBy === 'failCount'}
						onClick={setSort}
						sort='failCount'
					>
						{t('Fails')}
					</GenericTableHeaderCell>
				</>
			)}
		</>
	);

	return (
		<Box display='flex' flexDirection='column' height='full'>
			{isLoading && (
				<GenericTable>
					<GenericTableHeader>{headers}</GenericTableHeader>
					<GenericTableBody>
						<GenericTableLoadingTable headerCells={mediaQuery ? 6 : 3} />
					</GenericTableBody>
				</GenericTable>
			)}

			{isSuccess && data.jobs.length === 0 && <GenericNoResults />}

			{isSuccess && data.jobs.length > 0 && (
				<>
					<GenericTable>
						<GenericTableHeader>{headers}</GenericTableHeader>
						<GenericTableBody>
							{data.jobs.map((job: any) => (
								<ScheduledJobRow key={job._id} job={job} />
							))}
						</GenericTableBody>
					</GenericTable>
					<Pagination
						divider
						current={current}
						itemsPerPage={itemsPerPage}
						count={data?.total || 0}
						onSetItemsPerPage={setItemsPerPage}
						onSetCurrent={setCurrent}
						{...paginationProps}
					/>
				</>
			)}

			{isError && (
				<States>
					<StatesIcon name='warning' variation='danger' />
					<StatesTitle>{t('Something_went_wrong')}</StatesTitle>
					<StatesActions>
						<StatesAction onClick={() => refetch()}>{t('Reload_page')}</StatesAction>
					</StatesActions>
				</States>
			)}
		</Box>
	);
};

export default ScheduledJobsTable;