import { Box, Icon, Margins, TextInput, Select } from '@rocket.chat/fuselage';
import { useBreakpoints } from '@rocket.chat/fuselage-hooks';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ScheduledJobsFilters = {
    text: string;
    source: string;
};

type ScheduledJobsFiltersProps = {
    setFilters: Dispatch<SetStateAction<ScheduledJobsFilters>>;
};

const ScheduledJobsFilters = ({ setFilters }: ScheduledJobsFiltersProps) => {
    const { t } = useTranslation();
    const [text, setText] = useState('');
    const [source, setSource] = useState('all');

    const breakpoints = useBreakpoints();
    const isLargeScreenOrBigger = breakpoints.includes('lg');

    const handleSearchTextChange = useCallback(
        (event: FormEvent<HTMLInputElement>) => {
            setText(event.currentTarget.value);
            setFilters({ text: event.currentTarget.value, source });
        },
        [source, setFilters],
    );

    const handleSourceChange = useCallback(
        (value: string) => {
            setSource(value);
            setFilters({ text, source: value });
        },
        [text, setFilters],
    );

    return (
        <Box
            mb={16}
            is='form'
            onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}
            display='flex'
            flexWrap='wrap'
            alignItems='center'
        >
            <Margins inlineEnd={isLargeScreenOrBigger ? 16 : 0}>
                <TextInput
                    placeholder={t('Search_Jobs')}
                    addon={<Icon name='magnifier' size='x20' />}
                    onChange={handleSearchTextChange}
                    value={text}
                    flexGrow={2}
                    minWidth='x220'
                    aria-label={t('Search_Jobs')}
                />
            </Margins>
            <Box mb={4} width={isLargeScreenOrBigger ? 'unset' : '100%'}>
                <Select
                    value={source}
                    onChange={(val) => handleSourceChange(val as string)}
                    options={[
                        ['all', t('All_Sources')],
                        ['core', t('Core')],
                        ['apps-engine', t('Apps_Engine')],
                    ]}
                />
            </Box>
        </Box>
    );
};

export default ScheduledJobsFilters;