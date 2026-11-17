-- PP 80/2019 Pasal 69(1): a return window shorter than 2 days is no longer a setting a brand can
-- save. A stored 1-day window becomes 2; 0 still turns change-of-mind returns off.
update tenants set data = jsonb_set(data, '{returnWindowDays}', '2')
where data ? 'returnWindowDays' and (data->>'returnWindowDays')::int = 1;
