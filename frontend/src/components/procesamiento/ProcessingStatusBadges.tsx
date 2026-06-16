import React from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

import StatusBadge from '@/components/layout/StatusBadge';
import { API_URL } from '@/config/api';

/** Estado Drive + Config — mostrado en la vista de procesamiento manual (Legacy). */
const ProcessingStatusBadges: React.FC<{ className?: string }> = ({ className }) => {
    const { data: status, isLoading } = useQuery({
        queryKey: ['drive-status'],
        queryFn: async () => {
            const response = await axios.get(`${API_URL}/procesamiento/status-drive`);
            return response.data;
        },
        refetchInterval: 5000,
    });

    return (
        <div className={`flex flex-wrap items-center gap-2 sm:gap-4 ${className ?? ''}`}>
            <StatusBadge active={status?.drive_connected} label="Drive" loading={isLoading} />
            <StatusBadge active={status?.config_exists} label="Config" loading={isLoading} />
        </div>
    );
};

export default ProcessingStatusBadges;
