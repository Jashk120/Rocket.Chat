import { usePermission } from '@rocket.chat/ui-contexts';
import type { ReactElement } from 'react';

import ScheduledJobsPage from './ScheduledJobsPage';
import NotAuthorizedPage from '../../notAuthorized/NotAuthorizedPage';

const ScheduledJobsRoute = (): ReactElement => {
	const canViewScheduledJobs = usePermission('view-privileged-setting');

	if (!canViewScheduledJobs) {
		return <NotAuthorizedPage />;
	}

	return <ScheduledJobsPage />;
};

export default ScheduledJobsRoute;
