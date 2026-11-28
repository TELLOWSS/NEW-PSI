import { ACCIDENT_BIGDATA_UPDATED_EVENT } from './accidentBigData';
import { LOCAL_SAFETY_OBSERVATIONS_STORAGE_KEY } from './safetyClosureLoopHelper';
import { SITE_ISSUES_UPDATED_EVENT } from './siteIssueStorage';

export const PSI_REGISTERED_INDEXED_DBS = [
    'PSI_Enterprise_V4',
    'psi-offline-queue',
    'psi-inspector-local-records',
    'psi-field-camera',
] as const;

export const PSI_OPERATIONAL_LOCAL_STORAGE_KEYS = [
    'psi_safety_checks',
    'psi_site_issues',
    'psi_accident_bigdata_v1',
    'psi_tbm_education_studio_v2',
    'psi_tbm_monthly_education_package_v1',
    'psi_tbm_package_handoff_pending_v1',
    'psi_risk_check_sessions_v1',
    'psi_site_violations_v1',
    LOCAL_SAFETY_OBSERVATIONS_STORAGE_KEY,
    'psi_safety_cases_v1',
    'psi_safety_case_focus_v1',
    'psi_safety_case_training_handoff_v1',
    'psi_monthly_archive_registry_v3',
    'psi_training_link_history',
    'psi_training_active_qr_state',
    'psi_ocr_batch_checkpoint_v1',
    'psi_ocr_view_state_v1',
    'psi_judgment_tagging_live_records',
    'psi_judgment_tagging_live_quality',
    'psi_predictive_execution_plan_status_v1',
    'psi_predictive_intervention_handoff_v1',
    'psi_intervention_focus_plan_key_v1',
    'psi_accident_education_handoff_v1',
    'psi_one_point_proof_session_v1',
    'psi_a4_local_output_review_v1',
    'psi_reports_delivery_snapshot_v1',
    'psi_reports_verification_history_v1',
    'psi_reports_verification_status_filter_v1',
    'psi_reports_verification_failure_filter_v1',
    'psi_reports_verification_package_filter_v1',
    'psi_ops_alert_click_log_v1',
    'psi_intro_mobile_feature_qa_alert_runlog_v1',
    'psi_dashboard_live_sync_snapshot_v1',
    'psi_dashboard_riskmap_focus_v1',
    'psi_survey_manager_risk_baselines_v1',
    'psi_survey_manager_risk_baseline_history_v1',
    'psi_survey_risk_baselines_pending_v1',
    'psi_nexus_ai_investigations_v1',
    'psi_nexus_approved_custom_seeds_v1',
    'psi_nexus_ceo_training_campaigns_v1',
    'psi_nexus_ceo_training_handoff_v1',
    'psi_nexus_equipment_photo_reports_v1',
    'psi_nexus_hq_visit_plans_v1',
    'psi_nexus_offline_sync_queue_v1',
    'psi_nexus_site_master_v1',
    'psi_nexus_structural_pipeline_v1',
    'psi-photo-set-draft-v1',
    'psi-local-input-draft-v1',
    'psi-single-photo-draft-v1',
    'psi_best_practice_sync_status_v1',
    'psi_best_practice_sync_failure_logs_v1',
] as const;

export const PSI_OPERATIONAL_KEY_PREFIXES = [
    'PSI_evidence_',
    'PSI_INTERNAL_MASKED_PDF_REVIEW_',
    'PSI_INTERNAL_MASKED_PHOTO_REVIEW_',
    'PSI_INTERNAL_REVIEW_SUBSET_',
    'PSI_INTERNAL_TEXT_PRIVACY_REVIEW_',
    'psi_feedback_outbox',
] as const;

const deleteIndexedDbSafely = (dbName: string): Promise<void> => {
    if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        };
        const timer = window.setTimeout(finish, 800);
        try {
            const req = window.indexedDB.deleteDatabase(dbName);
            req.onsuccess = () => {
                window.clearTimeout(timer);
                finish();
            };
            req.onerror = () => {
                window.clearTimeout(timer);
                finish();
            };
            req.onblocked = () => {
                window.clearTimeout(timer);
                finish();
            };
        } catch {
            window.clearTimeout(timer);
            finish();
        }
    });
};

export const clearRegisteredOperationalLocalStorage = (): void => {
    if (typeof window === 'undefined' || !window.localStorage) return;

    for (const key of PSI_OPERATIONAL_LOCAL_STORAGE_KEYS) {
        try {
            window.localStorage.removeItem(key);
        } catch {
            // ignore storage errors
        }
    }

    const dynamicKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (PSI_OPERATIONAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
            dynamicKeys.push(key);
        }
    }
    for (const key of dynamicKeys) {
        try {
            window.localStorage.removeItem(key);
        } catch {
            // ignore storage errors
        }
    }
};

export const purgeAllRegisteredAppStorage = async (options?: {
    skipPrimaryDb?: boolean;
}): Promise<void> => {
    clearRegisteredOperationalLocalStorage();

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SITE_ISSUES_UPDATED_EVENT));
        window.dispatchEvent(new CustomEvent(ACCIDENT_BIGDATA_UPDATED_EVENT));
    }

    const dbTargets = PSI_REGISTERED_INDEXED_DBS.filter(
        (name) => !(options?.skipPrimaryDb && name === 'PSI_Enterprise_V4'),
    );
    await Promise.all(dbTargets.map((dbName) => deleteIndexedDbSafely(dbName)));
};
