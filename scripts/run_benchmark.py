import json
import pathlib
from collections import Counter
from datetime import datetime

ROOT_DIR = pathlib.Path(__file__).resolve().parent.parent


def load_knowledge_base():
    kb_dir = ROOT_DIR / "data" / "knowledge"
    project = json.loads((kb_dir / "knowledge-base-project.json").read_text(encoding="utf-8"))
    general = json.loads((kb_dir / "knowledge-base-general.json").read_text(encoding="utf-8"))
    return project + general


def tokenize(text: str):
    return [t for t in text.lower().replace("\n", " ").split() if t]


def build_dataset(kb):
    labeled = [
        {
            "query": (doc.get("aliases") or [doc.get("title", "")])[0],
            "expectedId": doc.get("id"),
            "type": "kb_alias",
        }
        for doc in kb[:20]
    ]

    adversarial_queries = [
        "сколько стоит подписка",
        "как отменить оплату",
        "свяжите меня с оператором",
        "мобильное приложение вайлт",
        "официальный телефон поддержки",
        "скачать клиент whilet",
        "ошибка 500 при оплате",
        "хочу удалить аккаунт",
        "где сменить язык интерфейса",
        "как восстановить пароль",
        "не работает интеграция",
        "покажи код примера",
    ]
    adversarial = [
        {"query": q, "expectedId": None, "type": "adversarial"}
        for q in adversarial_queries
    ]
    return labeled + adversarial


def score_document(doc, tokens):
    title = doc.get("title", "").lower()
    aliases = " ".join(doc.get("aliases") or []).lower()
    content = doc.get("content", "").lower()
    tags = " ".join(doc.get("tags") or []).lower()

    counts = Counter()
    for token in tokens:
        if not token:
            continue
        if token in title:
            counts[token] += 4.0
        if token in aliases:
            counts[token] += 2.5
        if token in tags:
            counts[token] += 2.0
        if token in content:
            counts[token] += 1.0
        if token and f" {token} " in f" {doc.get('title','').lower()} ":
            counts[token] += 0.5
    joined = " ".join(tokens)
    if joined.strip() and joined in title:
        counts[joined] += 5.0
    if joined.strip() and joined in aliases:
        counts[joined] += 5.0

    return sum(counts.values())


def evaluate(kb, dataset):
    results = []
    for item in dataset:
        tokens = tokenize(item["query"])
        scored = [(score_document(doc, tokens), doc) for doc in kb]
        scored.sort(key=lambda x: x[0], reverse=True)
        top_score, top_doc = scored[0]
        predicted_id = top_doc.get("id") if top_score > 0 else None
        success = item["expectedId"] is not None and predicted_id == item["expectedId"]
        results.append(
            {
                "query": item["query"],
                "expectedId": item["expectedId"],
                "predictedId": predicted_id,
                "topScore": round(top_score, 3),
                "success": success,
                "type": item["type"],
                "topTitle": top_doc.get("title") if predicted_id else None,
                "methods": [],
            }
        )
    labeled = [r for r in results if r["expectedId"]]
    hits = sum(1 for r in labeled if r["success"])
    accuracy = hits / len(labeled) if labeled else 0.0
    return results, accuracy


def persist_outputs(results, accuracy):
    reports_dir = ROOT_DIR / "reports"
    eval_dir = ROOT_DIR / "data" / "eval"
    reports_dir.mkdir(parents=True, exist_ok=True)
    eval_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.utcnow().isoformat()
    metrics_payload = {
        "generatedAt": now,
        "benchmark": "knowledge_base_alias_top1",
        "metric": "accuracy",
        "accuracy": round(accuracy, 3),
        "totalCases": len([r for r in results if r["expectedId"]]),
        "hits": len([r for r in results if r["success"]]),
    }
    (reports_dir / "benchmark_metrics.json").write_text(
        json.dumps(metrics_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    failures = [r for r in results if not r["success"]][:20]
    failure_payload = {
        "generatedAt": now,
        "totalFailures": len(failures),
        "cases": failures,
    }
    (eval_dir / "failure_cases.json").write_text(
        json.dumps(failure_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    kb = load_knowledge_base()
    dataset = build_dataset(kb)
    results, accuracy = evaluate(kb, dataset)
    persist_outputs(results, accuracy)
    print(f"Benchmark accuracy (top-1): {accuracy:.3f}")
    print(f"Total cases: {len([r for r in results if r['expectedId']])}")
    print(f"Failures captured: {len([r for r in results if not r['success']])}")
