import { Box, Pagination, States, StatesIcon, StatesTitle, StatesActions, StatesAction } from '@rocket.chat/fuselage';
import { useMediaQuery } from '@rocket.chat/fuselage-hooks';
import {
	GenericTable,
	GenericTableBody,
	GenericTableHeader,
	GenericTableHeaderCell,
	GenericTableLoadingTable,
	usePagination,
} from '@rocket.chat/ui-client';
import { useEndpoint } from '@rocket.chat/ui-contexts';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement, MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';

import ScheduledJobRow from './ScheduledJobRow';
import GenericNoResults from '../../../components/GenericNoResults';

type ScheduledJobsTableProps = {
    reload: MutableRefObject<() => void>;
	status?: 'failed' | 'disabled';
};

const ScheduledJobsTable = ({ status, reload }: ScheduledJobsTableProps): ReactElement => {
	const { t } = useTranslation();
	const mediaQuery = useMediaQuery('(min-width: 1024px)');

	const { current, itemsPerPage, setItemsPerPage, setCurrent, ...paginationProps } = usePagination();

   
	const getJobs = useEndpoint('GET', '/v1/jobs' as any, {} as any) as any;

	const { data, refetch, isSuccess, isLoading, isError } = useQuery({
		queryKey: ['jobs', status, current, itemsPerPage],
		queryFn: async () =>
			getJobs({
				...(status && { status }),
				count: String(itemsPerPage),
				offset: String(current),
			}),
	});
     useEffect(() => {
        reload.current = refetch;
    }, [reload, refetch]);


	const headers = (
		<>
			<GenericTableHeaderCell key='name' w='x240'>
				{t('Name')}
			</GenericTableHeaderCell>
			<GenericTableHeaderCell key='status' w='x120'>
				{t('Status')}
			</GenericTableHeaderCell>
			<GenericTableHeaderCell key='repeatInterval' w='x160'>
				{t('Repeat interval')}
			</GenericTableHeaderCell>
			{mediaQuery && (
				<>
					<GenericTableHeaderCell key='nextRunAt' w='x160'>
						{t('Next run')}
					</GenericTableHeaderCell>
					<GenericTableHeaderCell key='lastRunAt' w='x160'>
						{t('Last run')}
					</GenericTableHeaderCell>
					<GenericTableHeaderCell key='failCount' w='x80'>
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