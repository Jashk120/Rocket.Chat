import { ContextualbarHeader, ContextualbarTitle, ContextualbarClose, ContextualbarSkeletonBody } from '@rocket.chat/ui-client';
import { useEndpoint } from '@rocket.chat/ui-contexts';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import EditScheduledJob from './EditScheduledJob';

type EditScheduledJobWithDataProps = {
	id?: string;
	onClose: () => void;
};

const EditScheduledJobWithData = ({ id, onClose }: EditScheduledJobWithDataProps) => {
	const { t } = useTranslation();

	const getJobs = useEndpoint('GET', '/v1/jobs' as any, {} as any) as any;

	const { data, isPending } = useQuery({
		queryKey: ['jobs', id],
		queryFn: () => getJobs({ id }),
		enabled: !!id,
		meta: { apiErrorToastMessage: true },
	});

	if (isPending) {
		return (
			<>
				<ContextualbarHeader>
					<ContextualbarTitle>{t('Job details')}</ContextualbarTitle>
					<ContextualbarClose onClick={onClose} />
				</ContextualbarHeader>
				<ContextualbarSkeletonBody />
			</>
		);
	}

	const job = data?.jobs?.[0];

	if (!job) {
		return null;
	}

	return (
		<>
			<ContextualbarHeader>
				<ContextualbarTitle>{job.name}</ContextualbarTitle>
				<ContextualbarClose onClick={onClose} />
			</ContextualbarHeader>
			<EditScheduledJob job={job} onClose={onClose} />
		</>
	);
};

export default EditScheduledJobWithData;