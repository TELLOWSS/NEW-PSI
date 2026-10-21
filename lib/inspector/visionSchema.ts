export const visionSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PSI SAFETY INSPECTOR vision analysis import contract",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "inspection_id",
    "photo_id",
    "source_photo_sha256",
    "processing_mode",
    "observed_facts",
    "ai_hypotheses",
    "requires_confirmation",
    "recommended_controls",
    "law_candidate_keywords",
    "limitations"
  ],
  "properties": {
    "schema_version": {
      "const": "1.1"
    },
    "inspection_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "photo_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "source_photo_sha256": {
      "type": "string",
      "pattern": "^[A-Fa-f0-9]{64}$"
    },
    "processing_mode": {
      "enum": [
        "CHATGPT_MANUAL",
        "ON_DEVICE_OCR",
        "SIWC_ELIGIBLE_CLIENT",
        "PAID_API_APPROVED"
      ]
    },
    "observed_facts": {
      "type": "array",
      "maxItems": 50,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "text",
          "visual_basis",
          "confidence"
        ],
        "properties": {
          "text": {
            "type": "string",
            "minLength": 1
          },
          "visual_basis": {
            "type": "string",
            "minLength": 1
          },
          "confidence": {
            "enum": [
              "high",
              "medium",
              "low"
            ]
          }
        }
      }
    },
    "ai_hypotheses": {
      "type": "array",
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "text",
          "reason"
        ],
        "properties": {
          "text": {
            "type": "string",
            "minLength": 1
          },
          "reason": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    },
    "requires_confirmation": {
      "type": "array",
      "maxItems": 50,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "question",
          "why"
        ],
        "properties": {
          "question": {
            "type": "string",
            "minLength": 1
          },
          "why": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    },
    "recommended_controls": {
      "type": "array",
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "action",
          "priority"
        ],
        "properties": {
          "action": {
            "type": "string",
            "minLength": 1
          },
          "priority": {
            "enum": [
              "immediate",
              "soon",
              "routine"
            ]
          }
        }
      }
    },
    "law_candidate_keywords": {
      "type": "array",
      "maxItems": 40,
      "items": {
        "type": "string",
        "minLength": 1
      }
    },
    "limitations": {
      "type": "array",
      "maxItems": 50,
      "items": {
        "type": "string",
        "minLength": 1
      }
    },
    "risk_findings": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "observation_index",
          "problem",
          "risk",
          "action",
          "priority"
        ],
        "properties": {
          "observation_index": {
            "type": "string",
            "enum": [
              "0",
              "1",
              "2",
              "3",
              "4",
              "5"
            ]
          },
          "problem": {
            "type": "string",
            "minLength": 1,
            "maxLength": 160
          },
          "risk": {
            "type": "string",
            "minLength": 1,
            "maxLength": 160
          },
          "action": {
            "type": "string",
            "minLength": 1,
            "maxLength": 160
          },
          "priority": {
            "enum": [
              "immediate",
              "soon",
              "routine"
            ]
          }
        }
      }
    }
  }
} as const;
