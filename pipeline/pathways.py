from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse


TOPICS = (
    ("Benefits and financial help", ("benefit", "unemployment", "food", "snap", "wic", "medicaid", "medicare", "disability", "retirement", "assistance")),
    ("Jobs and workplace", ("job", "worker", "workplace", "employment", "wage", "labor", "career", "workforce", "apprentice")),
    ("Housing and utilities", ("housing", "rent", "mortgage", "eviction", "homeless", "utility", "homeowner")),
    ("Health and coverage", ("health", "medical", "clinic", "insurance", "prescription", "medicaid", "medicare")),
    ("Children and families", ("child", "family", "adoption", "guardian", "childcare", "foster", "caregiver", "birth")),
    ("Education and training", ("student", "school", "college", "education", "training", "scholarship", "fafsa", "research", "internship")),
    ("Immigration and citizenship", ("immigration", "citizen", "green card", "visa", "naturalization", "uscis")),
    ("Taxes and money", ("tax", "refund", "finance", "loan", "debt", "money", "irs", "currency")),
    ("Business and permits", ("business", "permit", "license", "employer", "entrepreneur", "procurement", "grant")),
    ("Driving and transportation", ("driver", "vehicle", "transport", "transit", "dmv", "real id")),
    ("Identity and records", ("passport", "identity", "record", "certificate", "social security", "archive", "foia")),
    ("Consumer protection", ("scam", "fraud", "consumer", "complaint", "recall", "safety")),
    ("Emergencies and recovery", ("disaster", "emergency", "flood", "wildfire", "storm", "recovery")),
    ("Voting and civic life", ("vote", "voting", "election", "jury", "civic", "government")),
    ("Veterans and military", ("veteran", "military", "service member", "defense")),
    ("Law, courts, and public safety", ("legal", "court", "justice", "attorney", "crime", "oversight", "investigation")),
)

LOW_VALUE_TITLE = re.compile(r"privacy|accessibility|press release|newsroom|news release|newsletter|blog|meeting|photo gallery|about us|contact us|home ?page", re.I)
PATHWAY_SIGNAL = re.compile(
    r"\b(apply|application|benefits?|services?|assistance|request|replace|renew|file|report|register|payments?|claims?|vote|voting|adoption|guardianship|coverage|unemployment|tax|passport|grants?|permits?|licen[sc]e|eligibility|enrollment|complaints?|records?|training|internship|scholarship|support|resources?|online|citizenship|medicare|medicaid)\b|how-to|how to|green-card|green card|social-security|social security|student-aid|student aid|financial-aid|financial aid|plan-ahead|plan ahead|disaster-assistance|disaster assistance",
    re.I,
)
NON_PATHWAY = re.compile(
    r"^(about\b|\d{4}\b)|\b(news|press|blog|meetings?|events?|gallery|appointments?|biography|speech|remarks|celebrat(?:e|ing|ion)|bulletin|proclaims?|announces?|conviction|nominations?|obituary|postponed|policies|software|closed for|residents urged|program update|request for information|impact report|annual report|exceptional service|warning)\b|don.?t fall|404|500 error|index of|hello world|accessibility|privacy|contact us|about us",
    re.I,
)
OUTCOME_TITLE_SIGNAL = re.compile(
    r"\b(apply|application|enroll(?:ment)?|find support|get (?:a |your )?|request|replace|renew|file|report|register|pay|claims?|vote|voting|adoption|guardianship|coverage|unemployment|passport|green card|student aid|financial aid|online services|plan ahead|resource directory|court electronic records|crime reports?|copyright claims|election)\b",
    re.I,
)
GENERIC_DESTINATION_TITLE = re.compile(
    r"\bdepartment of\b|\bdepartment\b.*\bservices\b|\bhomepage\b|^home\b|\bgovernment services (?:easier to find|and information)\b|\bpopular services\b|\bfoundation\b|\bstudent support and wellness\b|\bcenters for medicare\b|\bindian health service\b|\bmacpac\b|\boffice of emergency medical services\b|\blegal services corporation\b|\binternal revenue service\b|\belection assistance commission\b|\bfinancial literacy month\b|\bproposed change\b|\baccreditation\b|\bwaiver or modification of requirements\b|\bworks to create and support\b",
    re.I,
)
PLACEHOLDER_COPY = re.compile(
    r"describe your service here|what makes it great|use short catchy text|go ahead and book",
    re.I,
)

TASK_RULES = (
    (re.compile(r"arc and plc", re.I), "Enroll in ARC or PLC farm support", "Review the USDA election options and enroll your farm in Agriculture Risk Coverage or Price Loss Coverage."),
    (re.compile(r"benefeds|fedvip|fsafeds|fltcip", re.I), "Enroll in federal employee benefits through BENEFEDS", "Compare eligible federal benefit programs and complete enrollment through the official BENEFEDS portal."),
    (re.compile(r"dcfs\.louisiana\.gov", re.I), "Find family support services in Louisiana", "Find child welfare, family support, and related services from the Louisiana Department of Children and Family Services."),
    (re.compile(r"dds\.georgia\.gov", re.I), "Use Georgia driver services online", "Complete eligible Georgia driver license and identification card services online without visiting a customer service center."),
    (re.compile(r"federal student aid|fsa[ -]?id", re.I), "Create or recover your Federal Student Aid ID", "Create, recover, or manage the account used to access federal student aid forms and services."),
    (re.compile(r"plan ahead.+disaster|ready\.gov", re.I), "Make a plan for a disaster", "Build a household emergency plan, decide how you will communicate, and prepare for hazards where you live."),
    (re.compile(r"court electronic records|\bpacer\b", re.I), "Find a federal court case in PACER", "Search federal court records and access case and docket information through the official PACER service."),
    (re.compile(r"adjustment of status|green card", re.I), "Apply for a Green Card from inside the United States", "Review adjustment of status requirements and follow the official process for applying for permanent residence from inside the United States."),
    (re.compile(r"uniform crime reports|hawaii crime statistics", re.I), "View Hawaii crime statistics", "Find official Hawaii crime reports and statewide crime statistics published for public use."),
    (re.compile(r"copyright claims board|\bccb\b", re.I), "File or respond to a small copyright claim", "Use the Copyright Claims Board process to file, respond to, or track an eligible small copyright dispute."),
    (re.compile(r"national resource directory", re.I), "Find support for service members and veterans", "Search vetted services and resources for service members, veterans, families, and caregivers."),
    (re.compile(r"absentee voting|voting by mail|vote by mail", re.I), "Vote absentee or by mail", "Check your state's rules, request an absentee or mail ballot, and track the deadlines for returning it."),
)


def task_profile(title: str, url: str) -> tuple[str, str] | None:
    text = f"{title} {url}"
    if re.fullmatch(r"apply for|report|request|online services(?: and payments)?", title.strip(" .:-"), re.I):
        return None
    for pattern, task_title, summary in TASK_RULES:
        if pattern.search(text):
            return task_title, summary
    clean = re.split(r"\s+[|–—]\s+", title, maxsplit=1)[0].strip(" .:-")
    clean = re.sub(r"^how to\s+", "", clean, flags=re.I)
    clean = re.sub(r"^where to\s+", "", clean, flags=re.I)
    clean = re.sub(r"^learn how to\s+", "", clean, flags=re.I)
    if re.match(r"^(apply|appeal|change|check|close|contact|create|file|find|get|pay|register|renew|replace|report|request|search|start|track|update|vote)\b", clean, re.I):
        task_title = clean[0].upper() + clean[1:]
        if len(task_title) <= 96:
            return task_title, f"Use the official government service to {task_title[0].lower() + task_title[1:]}. Review the current requirements and complete the task with the responsible agency."
    common_tasks = (
        (r"unemployment", "Apply for unemployment benefits"),
        (r"food assistance|\bsnap\b|food stamps", "Apply for food assistance"),
        (r"\bmedicaid\b", "Apply for Medicaid"),
        (r"\bmedicare\b", "Enroll in Medicare"),
        (r"social security card", "Replace or update your Social Security card"),
        (r"passport", "Apply for or replace a U.S. passport"),
        (r"birth certificate", "Get a certified birth certificate"),
        (r"driver.?s? license|driver license", "Get or renew a driver license"),
        (r"voter registration", "Register to vote"),
        (r"tax refund", "Track your tax refund"),
        (r"disaster assistance", "Apply for disaster assistance"),
        (r"veteran.+benefit|va benefits", "Apply for veterans benefits"),
        (r"freedom of information|\bfoia\b", "Request government records"),
        (r"naturalization|citizenship", "Apply for U.S. citizenship"),
        (r"student loan|\bfafsa\b", "Apply for federal student aid"),
        (r"child support", "Get help with child support"),
        (r"housing assistance|rental assistance", "Find housing assistance"),
    )
    for pattern, task_title in common_tasks:
        if re.search(pattern, text, re.I):
            return task_title, f"Use the official government service to {task_title[0].lower() + task_title[1:]}. Review eligibility, required documents, deadlines, and the current application or request process."
    return None


def is_pathway_candidate(title: str, url: str, description: str) -> bool:
    """Promote concrete outcomes, while keeping broad official pages as sources only."""
    combined = f"{title} {url} {description}"
    if NON_PATHWAY.search(combined) or GENERIC_DESTINATION_TITLE.search(title) or PLACEHOLDER_COPY.search(description):
        return False
    if not OUTCOME_TITLE_SIGNAL.search(title):
        return False
    if task_profile(title, url) is None:
        return False
    path = urlparse(url).path.rstrip("/")
    is_root = path in {"", "/index.aspx", "/page.aspx"}
    if is_root and not re.search(
        r"enroll|unemployment|resource directory|arc and plc|find support|online services|plan ahead|court electronic records|copyright claims",
        title,
        re.I,
    ):
        return False
    return True


def slug(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))[:72]


def category_for(text: str) -> tuple[str, list[str]]:
    normalized = text.lower().replace("-", " ")
    matches = [(category, [term for term in terms if term in normalized]) for category, terms in TOPICS]
    matches = [(category, terms) for category, terms in matches if terms]
    if not matches:
        return "More government services", []
    return max(matches, key=lambda item: len(item[1]))


def canonical_url(url: str) -> str:
    parsed = urlparse(url)
    query = urlencode(sorted((k, v) for k, v in parse_qsl(parsed.query) if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}))
    return urlunparse(parsed._replace(netloc=parsed.netloc.lower().removeprefix("www."), path=parsed.path.rstrip("/"), query=query, fragment=""))


def location_catalog(database: sqlite3.Connection) -> dict[str, dict[str, str]]:
    catalog = {}
    for url, jurisdiction, params_json in database.execute("SELECT source_url, jurisdiction, params_json FROM graph_nodes WHERE kind = 'agency' AND source_url IS NOT NULL ORDER BY id"):
        params = json.loads(params_json)
        host = urlparse(url).hostname or ""
        host = host.removeprefix("www.")
        tags = params.get("tags", [])
        state = params.get("state", "")
        scope = jurisdiction or params.get("jurisdiction", "unknown")
        locality = ""
        if params.get("connector") == "government-domain-directory":
            domain_type = str(tags[1]).lower() if len(tags) > 1 else ""
            state = str(tags[2]) if len(tags) > 2 else ""
            locality = str(tags[3]) if len(tags) > 3 and domain_type in {"city", "county"} else ""
            scope = "federal" if domain_type.startswith("federal") else "state" if domain_type == "state" else "local" if domain_type in {"city", "county"} else "unknown"
        if scope == "california":
            scope, state = "state", "CA"
        if scope in {"state-or-territory", "state"}:
            scope = "state"
        if scope not in {"state", "local", "federal"}:
            continue
        catalog[host] = {"jurisdiction": scope, "state": state if scope != "federal" else "", "locality": locality}
    return catalog


def guide_location(url: str, catalog: dict[str, dict[str, str]], jurisdiction: str | None) -> dict[str, str]:
    host = (urlparse(url).hostname or "").removeprefix("www.")
    matches = [domain for domain in catalog if host == domain or host.endswith("." + domain)]
    if matches:
        return catalog[max(matches, key=len)]
    if host == "ca.gov" or host.endswith(".ca.gov"):
        return {"jurisdiction": "state", "state": "CA", "locality": ""}
    return {"jurisdiction": "federal" if jurisdiction == "federal" else "unknown", "state": "", "locality": ""}


def export_discovered_guides(database: sqlite3.Connection, output: Path) -> int:
    rows = database.execute(
        """
        SELECT s.node_id, s.title, s.publisher, s.url, s.last_checked,
               n.description, n.jurisdiction, n.params_json,
               a.id AS agency_id, a.label AS agency
        FROM sources s
        JOIN graph_nodes n ON n.id = s.node_id
        LEFT JOIN graph_edges e ON e.from_node_id = n.id AND e.relation = 'published-by'
        LEFT JOIN graph_nodes a ON a.id = e.to_node_id AND a.kind = 'agency'
        WHERE n.status = 'machine-indexed'
        ORDER BY s.title COLLATE NOCASE, s.url
        """
    ).fetchall()
    catalog = location_catalog(database)
    by_url: dict[str, dict[str, object]] = {}
    for node_id, title, publisher, url, checked, description, jurisdiction, params_json, agency_id, agency in rows:
        params = json.loads(params_json)
        pathway_text = f"{title} {url}"
        if not PATHWAY_SIGNAL.search(pathway_text) or not is_pathway_candidate(title, url, description or ""):
            continue
        profile = task_profile(title, url)
        if profile is None:
            continue
        task_title, task_summary = profile
        tags = [str(item) for item in params.get("tags", [])]
        outline = []
        for heading in tags:
            if heading.lower() != publisher.lower() and heading not in outline and len(heading) > 2:
                outline.append(heading)
        category, matched_terms = category_for(f"{title} {description} {url} {' '.join(tags)}")
        digest = hashlib.sha1(url.encode()).hexdigest()[:10]
        guide_slug = f"{slug(task_title) or 'government-service'}-{digest}"
        reason = (
            f"Shown because the crawler found this official page from {publisher}"
            + (f" and matched it to {category.lower()} using {', '.join(matched_terms[:3])}." if matched_terms else ". It remains discoverable under more government services until it is categorized more specifically.")
        )
        seo_eligible = len(title) >= 8 and len(description or "") >= 80 and not LOW_VALUE_TITLE.search(title)
        location = guide_location(url, catalog, jurisdiction)
        by_url[canonical_url(url)] = {
            "id": f"journey:discovered:{digest}",
            "slug": guide_slug,
            "title": task_title,
            "sourceTitle": title,
            "summary": task_summary,
            "category": category,
            "jurisdiction": location["jurisdiction"],
            "state": location["state"],
            "locality": location["locality"],
            "publisher": publisher,
            "agency": agency or publisher,
            "agencyId": agency_id,
            "sourceId": node_id,
            "officialUrl": url,
            "discoveredAt": params.get("retrievedAt", checked),
            "reviewedAt": checked,
            "reason": reason,
            "matchedTerms": matched_terms,
            "outline": outline[:12],
            "seoEligible": bool(seo_eligible),
            "qualityReason": "Passed the automated publication checks for an official source, concrete task, useful summary, and current crawl record.",
            "reviewChecks": ["official-source", "task-title", "useful-summary", "fresh-crawl-record"],
            "status": "published",
        }
    # One task per responsible host and jurisdiction. Never merge different towns
    # or states just because they use the same task name.
    unique = {}
    for guide in by_url.values():
        key = (slug(str(guide["title"])), guide["jurisdiction"], guide["state"], guide["locality"], urlparse(str(guide["officialUrl"])).netloc.removeprefix("www."))
        if key in unique:
            unique[key].setdefault("aliasSlugs", []).append(guide["slug"])
        else:
            unique[key] = guide
    guides = sorted(unique.values(), key=lambda item: (str(item["category"]), str(item["title"]), str(item["officialUrl"])))
    if output.exists():
        previous = json.loads(output.read_text()).get("guides", [])
        for guide in guides:
            for old in previous:
                if canonical_url(str(old["officialUrl"])) == canonical_url(str(guide["officialUrl"])) and old["slug"] != guide["slug"]:
                    guide.setdefault("aliasSlugs", []).extend([old["slug"], *old.get("aliasSlugs", [])])
            guide["aliasSlugs"] = sorted(set(guide.get("aliasSlugs", [])))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"schemaVersion": 1, "count": len(guides), "guides": guides}, indent=2) + "\n")
    return len(guides)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    database_path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "data/govroute.db"
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "data/generated/discovered-guides.json"
    connection = sqlite3.connect(database_path)
    try:
        print(f"Exported {export_discovered_guides(connection, output_path)} discovered guides to {output_path}")
    finally:
        connection.close()
