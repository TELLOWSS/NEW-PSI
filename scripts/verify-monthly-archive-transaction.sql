-- PSI monthly archive receipt verification; synthetic data only.
-- Run the entire script in one SQL editor execution, as the migration owner.
-- No application secrets, original risk records or real worker data are used.
-- Refuses to run if either reserved synthetic organization already has data.
-- All inserts are rolled back. Never replace the final ROLLBACK with COMMIT.
-- PostgreSQL identity sequences are nontransactional: a few unused ID numbers
-- can be consumed. Do not reset the sequence; doing so could race real traffic.
-- If the editor stops on an assertion/error, execute ROLLBACK; immediately.
-- This checks transactional behavior, not a multi-connection concurrency test.

BEGIN;

DO $psi_archive_verification$
DECLARE
    v_organization constant text := 'psi-archive-verification-20260902';
    v_other_organization constant text := 'psi-archive-verification-20260902-other';
    v_site constant text := 'synthetic-site-a';
    v_other_site constant text := 'synthetic-site-b';
    v_period constant text := '2026-08';
    v_hash_one constant text := repeat('a', 64);
    v_hash_two constant text := repeat('b', 64);
    v_hash_conflict constant text := repeat('c', 64);
    v_id_one text;
    v_id_two text;
    v_id_conflict text;
    v_manifest_one jsonb;
    v_manifest_two jsonb;
    v_manifest_conflict jsonb;
    v_summary_one jsonb;
    v_summary_two jsonb;
    v_summary_other_scope jsonb;
    v_receipt record;
    v_retry record;
    v_original_received_at timestamptz;
    v_snapshot_before jsonb;
    v_snapshot_after jsonb;
    v_count integer;
    v_rejected boolean;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.risk_archive_manifests
        WHERE organization_id IN (v_organization, v_other_organization)
    ) OR EXISTS (
        SELECT 1 FROM public.worker_monthly_continuity
        WHERE organization_id IN (v_organization, v_other_organization)
    ) THEN
        RAISE EXCEPTION 'Verification refused: reserved synthetic scope already contains data. No cleanup was attempted.';
    END IF;

    IF has_function_privilege(
        'anon', 'public.psi_register_monthly_archive(text,text,jsonb,jsonb)', 'EXECUTE'
    ) IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'FAIL: anonymous role can execute archive registration';
    END IF;
    IF has_function_privilege(
        'authenticated', 'public.psi_register_monthly_archive(text,text,jsonb,jsonb)', 'EXECUTE'
    ) IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'FAIL: ordinary authenticated role can execute archive registration';
    END IF;
    IF has_function_privilege(
        'service_role', 'public.psi_register_monthly_archive(text,text,jsonb,jsonb)', 'EXECUTE'
    ) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'FAIL: service role cannot execute archive registration';
    END IF;
    IF has_table_privilege('anon', 'public.risk_archive_manifests', 'SELECT')
       OR has_table_privilege('anon', 'public.worker_monthly_continuity', 'SELECT')
       OR has_table_privilege('authenticated', 'public.risk_archive_manifests', 'SELECT')
       OR has_table_privilege('authenticated', 'public.worker_monthly_continuity', 'SELECT') THEN
        RAISE EXCEPTION 'FAIL: browser roles can directly read archive or continuity tables';
    END IF;
    SELECT count(*) INTO v_count
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('risk_archive_manifests', 'worker_monthly_continuity')
       AND c.relrowsecurity
       AND c.relforcerowsecurity;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: both archive tables must enforce row-level security';
    END IF;
    RAISE NOTICE 'PASS: anonymous/authenticated access denied; service-role RPC and forced RLS configured';

    v_id_one := v_period || '-g001-' || left(v_hash_one, 16);
    v_id_two := v_period || '-g002-' || left(v_hash_two, 16);
    v_id_conflict := v_period || '-g002-' || left(v_hash_conflict, 16);
    v_manifest_two := jsonb_build_object(
        'schema_version', 'psi-monthly-archive/v3',
        'archive_id', v_id_two,
        'period_month', v_period,
        'generation', 2,
        'file_name', 'PSI_' || v_id_two || '.json',
        'archive_created_at', '2026-09-02T00:00:00Z',
        'record_count', 2,
        'worker_count', 1,
        'portable_worker_count', 1,
        'unresolved_worker_count', 0,
        'min_date', '2026-08-01',
        'max_date', '2026-08-31',
        'content_root_hash', v_hash_two,
        'byte_size', 1024,
        'verified_at', '2026-09-02T00:01:00Z'
    );
    v_summary_two := jsonb_build_array(jsonb_build_object(
        'worker_uuid', 'WP-00000000000000000000000000000001',
        'assessment_count', 2,
        'first_assessment_date', '2026-08-01',
        'last_assessment_date', '2026-08-31',
        'average_score', 80,
        'minimum_score', 70,
        'latest_score', 90,
        'latest_safety_level', '고급',
        'attention_count', 0,
        'approved_count', 2
    ));
    v_manifest_one := v_manifest_two || jsonb_build_object(
        'archive_id', v_id_one, 'generation', 1,
        'file_name', 'PSI_' || v_id_one || '.json', 'content_root_hash', v_hash_one
    );
    v_summary_one := jsonb_build_array((v_summary_two->0) || jsonb_build_object(
        'average_score', 35, 'minimum_score', 30, 'latest_score', 40,
        'latest_safety_level', '초급', 'attention_count', 2, 'approved_count', 0
    ));
    v_manifest_conflict := v_manifest_two || jsonb_build_object(
        'archive_id', v_id_conflict,
        'file_name', 'PSI_' || v_id_conflict || '.json',
        'content_root_hash', v_hash_conflict
    );
    v_summary_other_scope := jsonb_build_array((v_summary_two->0) || jsonb_build_object(
        'average_score', 55, 'minimum_score', 50, 'latest_score', 60,
        'latest_safety_level', '중급', 'attention_count', 1, 'approved_count', 1
    ));

    SELECT * INTO v_receipt
      FROM public.psi_register_monthly_archive(v_organization, v_site, v_manifest_two, v_summary_two);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL: generation 2 registration returned no receipt';
    END IF;
    IF v_receipt.archive_id IS DISTINCT FROM v_id_two
       OR v_receipt.generation IS DISTINCT FROM 2
       OR v_receipt.worker_summary_count IS DISTINCT FROM 1
       OR v_receipt.continuity_is_current IS DISTINCT FROM true
       OR v_receipt.received_at IS NULL THEN
        RAISE EXCEPTION 'FAIL: generation 2 registration receipt is inconsistent';
    END IF;
    v_original_received_at := v_receipt.received_at;
    SELECT to_jsonb(c) INTO v_snapshot_before
      FROM public.worker_monthly_continuity AS c
     WHERE c.organization_id = v_organization
       AND c.site_id = v_site
       AND c.period_month = v_period;
    IF v_snapshot_before IS NULL
       OR (v_snapshot_before->>'archive_generation')::integer IS DISTINCT FROM 2
       OR (v_snapshot_before->>'latest_score')::integer IS DISTINCT FROM 90 THEN
        RAISE EXCEPTION 'FAIL: generation 2 continuity snapshot was not stored';
    END IF;
    RAISE NOTICE 'PASS: generation 2 receipt and current worker summary registered';

    SELECT * INTO v_retry
      FROM public.psi_register_monthly_archive(v_organization, v_site, v_manifest_two, v_summary_two);
    IF v_retry.archive_id IS DISTINCT FROM v_id_two
       OR v_retry.received_at IS DISTINCT FROM v_original_received_at
       OR v_retry.continuity_is_current IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'FAIL: same-generation retry changed the immutable receipt';
    END IF;
    SELECT count(*) INTO v_count FROM public.risk_archive_manifests
     WHERE organization_id = v_organization AND site_id = v_site;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL: retry inserted a duplicate receipt';
    END IF;
    SELECT to_jsonb(c) INTO v_snapshot_after
      FROM public.worker_monthly_continuity AS c
     WHERE c.organization_id = v_organization AND c.site_id = v_site AND c.period_month = v_period;
    IF v_snapshot_after IS DISTINCT FROM v_snapshot_before THEN
        RAISE EXCEPTION 'FAIL: retry changed the worker snapshot';
    END IF;
    RAISE NOTICE 'PASS: identical retry is idempotent';

    -- Same archive identity with different summary content must not overwrite it.
    v_rejected := false;
    BEGIN
        PERFORM 1 FROM public.psi_register_monthly_archive(v_organization, v_site, v_manifest_two, v_summary_one);
    EXCEPTION WHEN SQLSTATE '23505' THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'FAIL: altered retry summaries were not rejected with SQLSTATE 23505';
    END IF;

    SELECT * INTO v_receipt
      FROM public.psi_register_monthly_archive(v_organization, v_site, v_manifest_one, v_summary_one);
    IF v_receipt.generation IS DISTINCT FROM 1
       OR v_receipt.continuity_is_current IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'FAIL: late generation 1 receipt incorrectly became current';
    END IF;
    SELECT * INTO v_retry
      FROM public.psi_register_monthly_archive(v_organization, v_site, v_manifest_one, v_summary_one);
    IF v_retry.continuity_is_current IS DISTINCT FROM false
       OR v_retry.worker_summary_count IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'FAIL: stale-generation retry returned inconsistent metadata';
    END IF;
    SELECT to_jsonb(c) INTO v_snapshot_after
      FROM public.worker_monthly_continuity AS c
     WHERE c.organization_id = v_organization AND c.site_id = v_site AND c.period_month = v_period;
    IF v_snapshot_after IS DISTINCT FROM v_snapshot_before THEN
        RAISE EXCEPTION 'FAIL: late generation 1 registration rolled back the latest summary';
    END IF;
    SELECT count(*) INTO v_count FROM public.risk_archive_manifests
     WHERE organization_id = v_organization AND site_id = v_site;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: expected exactly two archive generations';
    END IF;
    RAISE NOTICE 'PASS: stale generation retained as receipt only; generation 2 snapshot unchanged';

    v_rejected := false;
    BEGIN
        PERFORM 1 FROM public.psi_register_monthly_archive(v_organization, v_site, v_manifest_conflict, v_summary_two);
    EXCEPTION WHEN SQLSTATE '23505' THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'FAIL: same-generation different hash was not rejected with SQLSTATE 23505';
    END IF;
    RAISE NOTICE 'PASS: different content in the same generation is rejected with SQLSTATE 23505';

    v_rejected := false;
    BEGIN
        PERFORM 1 FROM public.psi_register_monthly_archive(
            v_organization, v_site,
            v_manifest_two || jsonb_build_object('document_text', 'SYNTHETIC_REJECTION_TEST_ONLY'),
            v_summary_two
        );
    EXCEPTION WHEN SQLSTATE '22023' THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'FAIL: raw-document field was not rejected with SQLSTATE 22023';
    END IF;
    v_rejected := false;
    BEGIN
        PERFORM 1 FROM public.psi_register_monthly_archive(
            v_organization, v_site, v_manifest_two,
            jsonb_build_array((v_summary_two->0) || jsonb_build_object('full_text', 'SYNTHETIC_REJECTION_TEST_ONLY'))
        );
    EXCEPTION WHEN SQLSTATE '22023' THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'FAIL: raw-text summary field was not rejected with SQLSTATE 22023';
    END IF;
    RAISE NOTICE 'PASS: raw-content fields rejected at both manifest and worker-summary boundaries';

    -- The same synthetic worker ID and generation are independent in other scopes.
    PERFORM 1 FROM public.psi_register_monthly_archive(v_organization, v_other_site, v_manifest_two, v_summary_other_scope);
    PERFORM 1 FROM public.psi_register_monthly_archive(v_other_organization, v_site, v_manifest_two, v_summary_other_scope);
    SELECT count(*) INTO v_count FROM public.worker_monthly_continuity
     WHERE ((organization_id = v_organization AND site_id = v_other_site)
            OR (organization_id = v_other_organization AND site_id = v_site))
       AND period_month = v_period AND archive_generation = 2 AND latest_score = 60;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: independent organization/site snapshots were not retained';
    END IF;
    SELECT to_jsonb(c) INTO v_snapshot_after
      FROM public.worker_monthly_continuity AS c
     WHERE c.organization_id = v_organization AND c.site_id = v_site AND c.period_month = v_period;
    IF v_snapshot_after IS DISTINCT FROM v_snapshot_before THEN
        RAISE EXCEPTION 'FAIL: another organization or site modified the original scope';
    END IF;
    SELECT count(*) INTO v_count FROM public.risk_archive_manifests
     WHERE organization_id IN (v_organization, v_other_organization);
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'FAIL: expected four synthetic receipts before rollback, got %', v_count;
    END IF;
    SELECT count(*) INTO v_count FROM public.worker_monthly_continuity
     WHERE organization_id IN (v_organization, v_other_organization);
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'FAIL: expected three scoped synthetic summaries before rollback, got %', v_count;
    END IF;
    RAISE NOTICE 'PASS: organization and site scopes are isolated';
    RAISE NOTICE 'ALL ASSERTIONS PASSED. The following ROLLBACK removes every synthetic row.';
END;
$psi_archive_verification$;

ROLLBACK;

-- Both booleans must be true. No synthetic records remain after this script.
SELECT
    NOT EXISTS (
        SELECT 1 FROM public.risk_archive_manifests
        WHERE organization_id IN ('psi-archive-verification-20260902', 'psi-archive-verification-20260902-other')
    ) AS archive_rollback_verified,
    NOT EXISTS (
        SELECT 1 FROM public.worker_monthly_continuity
        WHERE organization_id IN ('psi-archive-verification-20260902', 'psi-archive-verification-20260902-other')
    ) AS continuity_rollback_verified;
