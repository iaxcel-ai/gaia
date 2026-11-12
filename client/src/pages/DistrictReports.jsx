import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFacilities } from '../api/facilities';
import { getDistrictReport } from '../api/reports';

function FacilityRanking({ rows }) {
  if (rows.length === 0) {
    return <p>No referrals yet.</p>;
  }
  return (
    <ol>
      {rows.map((row) => (
        <li key={row.facility_id}>{row.name}: {row.count}</li>
      ))}
    </ol>
  );
}

export default function DistrictReports() {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user.facility_id == null) return;
    // The admin's district is the district of the facility they belong to.
    getFacilities()
      .then((facilities) => {
        const own = facilities.find((f) => f.id === user.facility_id);
        return getDistrictReport(own.district_id);
      })
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [user.facility_id]);

  if (user.facility_id == null) {
    return <p>Your account is not assigned to a facility, so there is no district report to show.</p>;
  }
  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!report) {
    return <p>Loading report...</p>;
  }

  return (
    <div>
      <h1>District report</h1>

      <h2>Referrals</h2>
      <p>Total referrals: {report.referrals.total}</p>
      <ul>
        {Object.entries(report.referrals.by_status).map(([status, count]) => (
          <li key={status}>{status}: {count}</li>
        ))}
      </ul>

      <h2>Facilities sending the most referrals</h2>
      <FacilityRanking rows={report.top_referring} />

      <h2>Facilities receiving the most referrals</h2>
      <FacilityRanking rows={report.top_receiving} />

      <h2>Recurring resource gaps (last 30 days)</h2>
      {report.resource_gaps.length === 0 ? (
        <p>No recurring resource gaps.</p>
      ) : (
        <ul>
          {report.resource_gaps.map((gap) => (
            <li key={`${gap.facility_id}-${gap.type}`}>
              {gap.name}, {gap.type}: {gap.zero_count} times at zero
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
