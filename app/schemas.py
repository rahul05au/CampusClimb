"""
Pydantic Schemas for CampusClimb REST API (/api/v1/).

Defines strict request and response contracts for auth, dashboard views,
file uploads, and the bilingual agent endpoint.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

# Standard regex for email validation without third-party email_validator package
EMAIL_REGEX = r"^[\w\.\+\-]+@[a-zA-Z0-9\-]+(\.[a-zA-Z0-9\-]+)+$"


# --- Auth Schemas ---
class SignUpRequest(BaseModel):
    email: str = Field(
        ...,
        pattern=EMAIL_REGEX,
        description="User email address",
        json_schema_extra={"example": "student@campus.edu"},
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="User password (minimum 8 characters)",
        json_schema_extra={"example": "SecurePassword123!"},
    )


class LoginRequest(BaseModel):
    email: str = Field(
        ...,
        pattern=EMAIL_REGEX,
        description="User email address",
        json_schema_extra={"example": "student@campus.edu"},
    )
    password: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="User password",
        json_schema_extra={"example": "SecurePassword123!"},
    )


class UserResponse(BaseModel):
    id: str
    email: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    user: UserResponse


# --- System Stats & Dashboard Schemas ---
class StatsResponse(BaseModel):
    syllabus_count: int
    notes_count: int
    pyq_count: int
    supported_subjects: List[str]


class TopicSummary(BaseModel):
    id: int
    subject: str
    unit_number: int
    unit_name: str
    topic_name: str
    importance_score: float
    importance_label: str
    question_count: int
    chunk_count: int
    notes: List[str]


class DashboardStats(BaseModel):
    total_chunks: int
    useful_chunks: int
    filtered_chunks: int
    dedup_reduction: float
    avg_confidence: float


class DashboardResponse(BaseModel):
    topics: List[TopicSummary]
    supported_subjects: List[str]
    selected_subject: Optional[str] = None
    stats: DashboardStats


# --- Topic Detail Schemas ---
class ChunkDetail(BaseModel):
    id: int
    chunk_text: str
    student_name: str
    similarity_score: Optional[float] = None
    cluster_id: Optional[int] = None
    is_representative: bool
    confidence: Optional[str] = None
    margin: Optional[float] = None
    chunk_type: Optional[str] = None


class PYQDetail(BaseModel):
    id: int
    question_text: str
    year: int
    confidence: Optional[str] = None


class TopicDetail(BaseModel):
    id: int
    subject: str
    unit_number: int
    unit_name: str
    topic_name: str
    representative_notes: str


class TopicImportanceDetail(BaseModel):
    score: float
    label: str
    question_count: int


class TopicDetailResponse(BaseModel):
    topic: Optional[TopicDetail] = None
    importance: Optional[TopicImportanceDetail] = None
    high_med_chunks: List[ChunkDetail]
    mixed_chunks: List[ChunkDetail]
    low_chunks: List[ChunkDetail]
    clusters: Dict[str, List[ChunkDetail]]
    key_concepts: List[str]
    pyqs: List[PYQDetail]
    total_chunks: int


# --- Upload Schemas ---
class UploadResponse(BaseModel):
    status: str = "success"
    message: str
    details: Optional[Dict[str, Any]] = None


# --- Bilingual Agent Schemas ---
class CitationItem(BaseModel):
    citation_id: int
    source_id: int
    source_name: str
    chunk_id: int
    page_number: Optional[int] = None
    snippet: str
    similarity_score: Optional[float] = None


class SourceItemSchema(BaseModel):
    id: int
    filename: str
    student_name: Optional[str] = None
    upload_date: Optional[str] = None
    chunk_count: int = 0


class SourceListResponse(BaseModel):
    subject: str
    sources: List[SourceItemSchema]


class AgentQueryRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="Query or question from the student",
        json_schema_extra={"example": "Explain paging and page table structure"},
    )
    subject: str = Field(
        "Operating Systems",
        min_length=1,
        max_length=100,
        description="Subject name",
        json_schema_extra={"example": "Operating Systems"},
    )
    language: Optional[str] = Field(
        "auto",
        max_length=50,
        description="Target response language",
        json_schema_extra={"example": "auto"},
    )
    selected_source_ids: Optional[List[int]] = Field(
        None,
        description="Specific source Note IDs to restrict retrieval to. If omitted, all user sources for the subject are used.",
    )
    chat_history: Optional[List[Dict[str, str]]] = Field(
        None,
        description="Optional recent conversation turns for context continuity.",
    )


class SourceChunkSchema(BaseModel):
    id: int
    text: str
    similarity_score: Optional[float] = None


class SyllabusAlignment(BaseModel):
    is_aligned: bool
    status: str = "in_syllabus"  # "in_syllabus" | "out_of_syllabus"
    unit_number: Optional[int] = None
    unit_name: Optional[str] = None
    matched_topic: Optional[str] = None
    confidence: float = 0.0
    reason: Optional[str] = None


class AgentQueryResponse(BaseModel):
    query: str
    subject: str
    language: str
    matched_topic: str
    confidence_score: float
    confidence_label: str
    answer: str
    explanation: str
    sources: List[SourceChunkSchema] = Field(default_factory=list)
    selected_source_ids: Optional[List[int]] = None
    source_type: str = "notes"  # "notes" | "general_knowledge"
    notes_match: bool = True
    fallback_used: bool = False
    notice: Optional[str] = None
    citations: List[CitationItem] = Field(default_factory=list)
    diagram_mermaid: Optional[str] = None
    related_questions: List[str] = Field(default_factory=list)
    syllabus_alignment: Optional[SyllabusAlignment] = None


# --- Study & Academic Intelligence Engine Schemas ---
class TopicProgressSummary(BaseModel):
    id: Optional[int] = None
    topic_id: int
    topic_name: str
    unit_number: int
    unit_name: str
    revision_completed: bool = False
    flashcards_completed: bool = False
    quizzes_taken: int = 0
    last_quiz_score: Optional[float] = None
    mastery_score: float = 0.0
    importance_score: float = 0.0
    importance_label: str = "Low"
    question_count: int = 0


class NextBestAction(BaseModel):
    topic_id: int
    topic_name: str
    unit_number: int
    unit_name: str
    action_type: str  # "revision" | "quiz" | "flashcards"
    action_label: str
    duration_minutes: int
    urgency_score: float
    pyq_count: int
    mastery_score: float
    reason: str
    why_topic: Dict[str, Any] = Field(default_factory=dict)


class ExamReadinessBreakdown(BaseModel):
    overall_score: float
    pyq_coverage: float
    topic_mastery: float
    quiz_accuracy: float
    revision_rate: float
    weakest_topic: Optional[str] = None
    highest_value_improvement: str


class StudyOverviewResponse(BaseModel):
    subject_id: int
    subject_name: str
    exam_readiness: ExamReadinessBreakdown
    next_best_action: Optional[NextBestAction] = None
    topics: List[TopicProgressSummary] = Field(default_factory=list)
    active_plan: Optional[Dict[str, Any]] = None


class HighYieldRevisionRequest(BaseModel):
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None


class HighYieldRevisionResponse(BaseModel):
    topic_id: int
    topic_name: str
    unit_number: int
    unit_name: str
    must_know: List[str]
    remember: List[str]
    exam_angle: str
    common_trap: str
    quick_recall: str
    diagram_mermaid: Optional[str] = None


class FlashcardItem(BaseModel):
    id: int
    question: str
    answer: str
    key_takeaway: str
    exam_angle: Optional[str] = None
    common_trap: Optional[str] = None


class FlashcardRating(BaseModel):
    card_id: int
    rating: str = Field(..., pattern=r"^(Again|Hard|Good|Easy)$")


class FlashcardsRequest(BaseModel):
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None


class FlashcardsCompleteRequest(BaseModel):
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    ratings: Optional[List[FlashcardRating]] = None


class FlashcardsResponse(BaseModel):
    topic_id: int
    topic_name: str
    cards: List[FlashcardItem] = Field(default_factory=list)


class QuizQuestion(BaseModel):
    id: int
    question: str
    options: List[str]
    correct_index: Optional[int] = None  # None when sent to student, evaluated server-side
    explanation: Optional[str] = None
    exam_tip: Optional[str] = None
    topic_tag: Optional[str] = None


class QuizRequest(BaseModel):
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None


class QuizResponse(BaseModel):
    topic_id: int
    topic_name: str
    quiz_id: str
    questions: List[QuizQuestion] = Field(default_factory=list)


class QuizAnswerItem(BaseModel):
    question_id: int
    selected_index: int


class QuizSubmitRequest(BaseModel):
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    quiz_id: str
    answers: List[QuizAnswerItem]


class QuizSubmitResponse(BaseModel):
    topic_id: int
    score_percentage: float
    total_questions: int
    correct_count: int
    mastery_score: float
    improvement_delta: float
    weak_concepts: List[str] = Field(default_factory=list)
    question_breakdown: List[Dict[str, Any]] = Field(default_factory=list)


class StudyPlanRequest(BaseModel):
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    exam_date: Optional[str] = None  # ISO format string or YYYY-MM-DD
    daily_hours: float = Field(2.0, ge=0.5, le=16.0)
    mode: str = Field("Sprint", pattern=r"^(Emergency|Sprint|Mastery)$")


class StudyPlanResponse(BaseModel):
    plan_id: int
    subject_id: int
    exam_date: Optional[str] = None
    daily_hours: float
    mode: str
    total_scheduled_minutes: int
    total_topics_covered: int
    tasks: List[Dict[str, Any]] = Field(default_factory=list)


class MockExamRequest(BaseModel):
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    mode: str = Field("standard", pattern=r"^(standard|quick)$")


class MockExamResponse(BaseModel):
    exam_id: str
    subject: str
    university_pattern: str
    total_marks: int
    duration_minutes: int
    instructions: List[str]
    part_a: List[Dict[str, Any]] = Field(default_factory=list)
    part_b: List[Dict[str, Any]] = Field(default_factory=list)


class MockExamAnswerItem(BaseModel):
    question_number: int
    part: str  # "A" or "B"
    student_answer: str


class MockExamSubmitRequest(BaseModel):
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    exam_id: str
    answers: List[MockExamAnswerItem]


class MockExamSubmitResponse(BaseModel):
    exam_id: str
    total_score: float
    max_marks: int
    percentage: float
    overall_feedback: str
    evaluations: List[Dict[str, Any]] = Field(default_factory=list)


