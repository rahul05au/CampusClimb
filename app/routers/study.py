"""
Study & Academic Intelligence Router — Versioned REST API v1 endpoints (/api/v1/study/).

Provides the complete closed-loop academic intelligence platform:
- Overview: Multi-signal Exam Readiness breakdown, Dynamic "Next Best Action", Topic Mastery list
- High-Yield 2-Minute Revision with conceptual diagrams
- Active Recall Flashcards (grounded)
- 5-Question Rapid Diagnostic Quizzes and immediate rubric-based mastery grading
- Adaptive Value-per-Minute Exam Planner
- Grounded, University-Aware Mock Exams with step-by-step marking rubrics
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_current_user_optional
from app.database import get_db
from app.models import (
    QuizAttempt,
    StudyPlan,
    Subject,
    SyllabusTopic,
    TopicImportance,
    TopicProgress,
)
from app.rate_limiter import ai_rate_limiter
from app.schemas import (
    ExamReadinessBreakdown,
    FlashcardItem,
    FlashcardsRequest,
    FlashcardsCompleteRequest,
    FlashcardsResponse,
    HighYieldRevisionRequest,
    HighYieldRevisionResponse,
    MockExamAnswerItem,
    MockExamRequest,
    MockExamResponse,
    MockExamSubmitRequest,
    MockExamSubmitResponse,
    NextBestAction,
    QuizQuestion,
    QuizRequest,
    QuizResponse,
    QuizSubmitRequest,
    QuizSubmitResponse,
    StudyOverviewResponse,
    StudyPlanRequest,
    StudyPlanResponse,
    TopicProgressSummary,
)
from core.study_engine import (
    StudyGenerationError,
    calculate_exam_readiness,
    calculate_topic_mastery,
    compute_next_best_action,
    generate_adaptive_study_plan,
    generate_grounded_flashcards,
    generate_high_yield_revision,
    generate_rapid_quiz,
    generate_university_mock_exam,
    submit_mock_exam,
    submit_rapid_quiz,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/study", tags=["Academic Intelligence & Study"])


def _resolve_subject(db: Session, subject_id: Optional[int], subject_name: Optional[str]) -> Subject:
    """Resolve canonical Subject entity by ID or name, with graceful default fallback."""
    subj = None
    if subject_id:
        subj = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subj and subject_name:
        subj = db.query(Subject).filter(Subject.name == subject_name).first()
    if not subj:
        # Fallback to first existing subject or default Operating Systems
        subj = db.query(Subject).first()
    if not subj:
        # Guarantee a subject record exists
        subj = Subject(name=subject_name or "Operating Systems")
        db.add(subj)
        db.commit()
        db.refresh(subj)
    return subj


def _resolve_topic(db: Session, topic_id: Optional[int], topic_name: Optional[str], subject_id: int) -> SyllabusTopic:
    """Resolve canonical SyllabusTopic entity by ID or name, with graceful default fallback."""
    topic = None
    if topic_id:
        topic = db.query(SyllabusTopic).filter(SyllabusTopic.id == topic_id).first()
    if not topic and topic_name:
        subj = db.query(Subject).filter(Subject.id == subject_id).first()
        subj_name = subj.name if subj else None
        q = db.query(SyllabusTopic).filter(SyllabusTopic.topic_name == topic_name)
        if subj_name:
            q = q.filter(SyllabusTopic.subject == subj_name)
        topic = q.first()
        if not topic:
            topic = db.query(SyllabusTopic).filter(SyllabusTopic.topic_name.ilike(f"%{topic_name}%")).first()
    if not topic:
        subj = db.query(Subject).filter(Subject.id == subject_id).first()
        subj_name = subj.name if subj else None
        if subj_name:
            topic = db.query(SyllabusTopic).filter(SyllabusTopic.subject == subj_name).first()
    if not topic:
        topic = db.query(SyllabusTopic).first()
    if not topic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No syllabus topic found. Please upload a syllabus first.",
        )
    return topic


@router.get("/overview", response_model=StudyOverviewResponse)
async def get_study_overview(
    subject_id: Optional[int] = Query(None),
    subject: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Fetch complete academic intelligence overview for the subject:

    Readiness breakdown, Next Best Action, topic-by-topic mastery, and active study plan.
    """
    user_id = _current_user.get("id") if _current_user else "guest_user"
    subj = _resolve_subject(db, subject_id, subject)

    # 1. Calculate multi-signal readiness
    readiness_data = calculate_exam_readiness(db=db, user_id=user_id, subject_id=subj.id)
    readiness = ExamReadinessBreakdown(
        overall_score=readiness_data["overall_score"],
        pyq_coverage=readiness_data["pyq_coverage"],
        topic_mastery=readiness_data["topic_mastery"],
        quiz_accuracy=readiness_data["quiz_accuracy"],
        revision_rate=readiness_data["revision_rate"],
        weakest_topic=readiness_data["weakest_topic"],
        highest_value_improvement=readiness_data["highest_value_improvement"],
    )

    # 2. Calculate dynamic Next Best Action
    action_data = compute_next_best_action(db=db, user_id=user_id, subject_id=subj.id)
    nba = None
    if action_data.get("topic_id", 0) > 0:
        why_dict = {
            "pyq_importance": action_data.get("importance", "Medium"),
            "pyq_appearances": action_data.get("pyq_count", 0),
            "mastery_level": f"{action_data.get('mastery_score', 0.0)}%",
            "urgency": "High unmastered exam score potential",
            "unit": f"Unit {action_data.get('unit_number', 1)}: {action_data.get('unit_name', '')}",
        }
        nba = NextBestAction(
            topic_id=action_data["topic_id"],
            topic_name=action_data["topic_name"],
            unit_number=action_data.get("unit_number", 1),
            unit_name=action_data.get("unit_name", ""),
            action_type=action_data.get("primary_action", "revision"),
            action_label=action_data.get("primary_action_label", "Review"),
            duration_minutes=action_data.get("estimated_minutes", 15),
            urgency_score=round(action_data.get("mastery_score", 0.0), 1),
            pyq_count=action_data.get("pyq_count", 0),
            mastery_score=action_data.get("mastery_score", 0.0),
            reason=action_data.get("reason", ""),
            why_topic=why_dict,
        )

    # 3. Batch fetch all topics for this subject
    topics = db.query(SyllabusTopic).filter(SyllabusTopic.subject == subj.name).all()
    topic_ids = [t.id for t in topics]

    progress_map = {
        p.topic_id: p
        for p in db.query(TopicProgress)
        .filter(TopicProgress.user_id == user_id, TopicProgress.subject_id == subj.id)
        .all()
    }
    importance_map = {
        i.topic_id: i
        for i in db.query(TopicImportance).filter(TopicImportance.topic_id.in_(topic_ids)).all()
    }

    topic_summaries = []
    for t in topics:
        p = progress_map.get(t.id)
        imp = importance_map.get(t.id)
        topic_summaries.append(
            TopicProgressSummary(
                id=p.id if p else None,
                topic_id=t.id,
                topic_name=t.topic_name,
                unit_number=t.unit_number,
                unit_name=t.unit_name,
                revision_completed=p.revision_completed if p else False,
                flashcards_completed=p.flashcards_completed if p else False,
                quizzes_taken=p.quizzes_taken if p else 0,
                last_quiz_score=p.last_quiz_score if p else None,
                mastery_score=p.mastery_score if p else 0.0,
                importance_score=imp.importance_score if imp else 0.0,
                importance_label=imp.importance_label if imp else "Low",
                question_count=imp.question_count if imp else 0,
            )
        )

    # 4. Fetch active study plan
    active_plan_record = (
        db.query(StudyPlan)
        .filter(StudyPlan.user_id == user_id, StudyPlan.subject_id == subj.id)
        .order_by(StudyPlan.updated_at.desc())
        .first()
    )
    active_plan = None
    if active_plan_record and active_plan_record.schedule_data:
        try:
            active_plan = json.loads(active_plan_record.schedule_data)
            active_plan["plan_id"] = active_plan_record.id
            active_plan["exam_date"] = (
                active_plan_record.exam_date.isoformat() if active_plan_record.exam_date else None
            )
            active_plan["mode"] = active_plan_record.mode
            active_plan["daily_hours"] = active_plan_record.daily_hours
        except Exception:
            active_plan = None

    return StudyOverviewResponse(
        subject_id=subj.id,
        subject_name=subj.name,
        exam_readiness=readiness,
        next_best_action=nba,
        topics=topic_summaries,
        active_plan=active_plan,
    )


@router.post("/revision", response_model=HighYieldRevisionResponse)
async def get_revision_sheet(
    request: Request,
    body: HighYieldRevisionRequest,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Generate or retrieve a grounded 2-Minute High-Yield Revision sheet."""
    ai_rate_limiter.check(request)
    user_id = _current_user.get("id") if _current_user else "guest_user"

    subj = _resolve_subject(db, body.subject_id, body.subject_name)
    topic = _resolve_topic(db, body.topic_id, body.topic_name, subj.id)

    try:
        data = await generate_high_yield_revision(
            db=db,
            user_id=user_id,
            subject_id=subj.id,
            topic_id=topic.id,
        )
    except StudyGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Academic synthesis unavailable: {str(exc)}. Retry in a few moments.",
        )
    except Exception as exc:
        logger.exception("Unexpected error in high-yield revision: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate revision material.",
        )

    return HighYieldRevisionResponse(
        topic_id=topic.id,
        topic_name=data.get("topic_name", topic.topic_name if topic else "Topic"),
        unit_number=topic.unit_number if topic else 1,
        unit_name=data.get("unit_name", topic.unit_name if topic else "Unit"),
        must_know=data.get("must_know", []),
        remember=data.get("remember", []),
        exam_angle=data.get("exam_angle", ""),
        common_trap=data.get("common_trap", ""),
        quick_recall=data.get("recall_question", ""),
        diagram_mermaid=data.get("diagram_mermaid"),
    )


@router.post("/flashcards", response_model=FlashcardsResponse)
async def get_flashcards(
    request: Request,
    body: FlashcardsRequest,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Synthesize grounded active recall flashcards for a syllabus topic."""
    ai_rate_limiter.check(request)
    user_id = _current_user.get("id") if _current_user else "guest_user"

    subj = _resolve_subject(db, body.subject_id, body.subject_name)
    topic = _resolve_topic(db, body.topic_id, body.topic_name, subj.id)

    try:
        cards_data = await generate_grounded_flashcards(
            db=db,
            user_id=user_id,
            subject_id=subj.id,
            topic_id=topic.id,
        )
    except StudyGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Flashcard generator unavailable: {str(exc)}. Please retry.",
        )

    cards = [
        FlashcardItem(
            id=c.get("id", idx + 1),
            question=c.get("question", ""),
            answer=c.get("answer", ""),
            key_takeaway=c.get("key_takeaway", ""),
            common_trap=c.get("common_trap"),
        )
        for idx, c in enumerate(cards_data)
    ]

    return FlashcardsResponse(
        topic_id=topic.id,
        topic_name=topic.topic_name if topic else "Topic",
        cards=cards,
    )


@router.post("/flashcards/complete")
async def mark_flashcards_completed(
    body: FlashcardsCompleteRequest,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Mark flashcards completed for a topic with optional PrepIQ confidence ratings and recalculate mastery."""
    user_id = _current_user.get("id") if _current_user else "guest_user"
    subj = _resolve_subject(db, body.subject_id, body.subject_name)
    topic = _resolve_topic(db, body.topic_id, body.topic_name, subj.id)

    # Compute retention score from confidence ratings (PrepIQ spaced repetition)
    retention = 1.0
    rating_counts = {"Again": 0, "Hard": 0, "Good": 0, "Easy": 0}
    if body.ratings:
        weights = {"Again": 0.20, "Hard": 0.50, "Good": 0.85, "Easy": 1.0}
        total_w = 0.0
        for r in body.ratings:
            w = weights.get(r.rating, 0.85)
            total_w += w
            if r.rating in rating_counts:
                rating_counts[r.rating] += 1
        retention = round(total_w / len(body.ratings), 2)

    prog = (
        db.query(TopicProgress)
        .filter(
            TopicProgress.user_id == user_id,
            TopicProgress.subject_id == subj.id,
            TopicProgress.topic_id == topic.id,
        )
        .first()
    )
    imp = db.query(TopicImportance).filter(TopicImportance.topic_id == topic.id).first()
    imp_score = imp.importance_score if imp else 0.5

    if prog:
        prog.flashcards_completed = True
        prog.mastery_score = calculate_topic_mastery(
            quiz_score=prog.last_quiz_score,
            revision_completed=prog.revision_completed,
            pyq_importance_score=imp_score,
            flashcards_completed=True,
            flashcards_retention=retention,
        )
    else:
        new_mastery = calculate_topic_mastery(
            quiz_score=None,
            revision_completed=False,
            pyq_importance_score=imp_score,
            flashcards_completed=True,
            flashcards_retention=retention,
        )
        prog = TopicProgress(
            user_id=user_id,
            subject_id=subj.id,
            topic_id=topic.id,
            flashcards_completed=True,
            mastery_score=new_mastery,
        )
        db.add(prog)
    db.commit()

    return {
        "status": "success",
        "mastery_score": prog.mastery_score,
        "retention_score": retention,
        "rating_breakdown": rating_counts,
    }


@router.post("/quiz", response_model=QuizResponse)
async def get_diagnostic_quiz(
    request: Request,
    body: QuizRequest,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Generate 5 targeted diagnostic questions for a topic."""
    ai_rate_limiter.check(request)
    user_id = _current_user.get("id") if _current_user else "guest_user"

    subj = _resolve_subject(db, body.subject_id, body.subject_name)
    topic = _resolve_topic(db, body.topic_id, body.topic_name, subj.id)

    try:
        quiz_data = await generate_rapid_quiz(
            db=db,
            user_id=user_id,
            subject_id=subj.id,
            topic_id=topic.id,
        )
    except StudyGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Quiz synthesis unavailable: {str(exc)}. Please retry.",
        )

    # Sanitize questions: strip correct_index and explanation before sending to client
    sanitized_questions = [
        QuizQuestion(
            id=q.get("id", idx + 1),
            question=q.get("question", ""),
            options=q.get("options", []),
            correct_index=None,
            explanation=None,
            exam_tip=q.get("exam_tip"),
            topic_tag=quiz_data.get("topic_name"),
        )
        for idx, q in enumerate(quiz_data.get("questions", []))
    ]

    return QuizResponse(
        topic_id=topic.id,
        topic_name=quiz_data.get("topic_name", topic.topic_name if topic else "Topic"),
        quiz_id=f"quiz_{topic.id}",
        questions=sanitized_questions,
    )


@router.post("/quiz/submit", response_model=QuizSubmitResponse)
async def submit_quiz(
    body: QuizSubmitRequest,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Score submitted diagnostic quiz answers, update topic mastery and return breakdown."""
    user_id = _current_user.get("id") if _current_user else "guest_user"
    subj = _resolve_subject(db, body.subject_id, body.subject_name)
    topic = _resolve_topic(db, body.topic_id, body.topic_name, subj.id)
    answers_list = [a.selected_index for a in body.answers]

    try:
        result = submit_rapid_quiz(
            db=db,
            user_id=user_id,
            subject_id=subj.id,
            topic_id=topic.id,
            submitted_answers=answers_list,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.exception("Quiz evaluation error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to evaluate quiz submission.",
        )

    return QuizSubmitResponse(
        topic_id=topic.id,
        score_percentage=result["score_percentage"],
        total_questions=result["total_questions"],
        correct_count=result["correct_answers"],
        mastery_score=result["new_topic_mastery"],
        improvement_delta=round(result["score_percentage"] * 0.5, 1),
        weak_concepts=result.get("weak_concepts", []),
        question_breakdown=result.get("breakdown", []),
    )


@router.post("/plan", response_model=StudyPlanResponse)
async def create_or_update_study_plan(
    body: StudyPlanRequest,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Generate an adaptive, value-per-minute study plan and persist for user."""
    user_id = _current_user.get("id") if _current_user else "guest_user"
    subj = _resolve_subject(db, body.subject_id, body.subject_name)

    parsed_exam_date = None
    if body.exam_date:
        try:
            parsed_exam_date = datetime.fromisoformat(body.exam_date.replace("Z", "+00:00"))
        except Exception:
            parsed_exam_date = None

    plan_result = generate_adaptive_study_plan(
        db=db,
        user_id=user_id,
        subject_id=subj.id,
        exam_date=parsed_exam_date,
        daily_hours=body.daily_hours,
        mode=body.mode,
    )

    # Persist or update StudyPlan
    existing = (
        db.query(StudyPlan)
        .filter(StudyPlan.user_id == user_id, StudyPlan.subject_id == subj.id)
        .first()
    )
    if existing:
        existing.exam_date = parsed_exam_date
        existing.daily_hours = body.daily_hours
        existing.mode = body.mode
        existing.schedule_data = json.dumps(plan_result)
        db.commit()
        plan_id = existing.id
    else:
        new_plan = StudyPlan(
            user_id=user_id,
            subject_id=subj.id,
            exam_date=parsed_exam_date,
            daily_hours=body.daily_hours,
            mode=body.mode,
            schedule_data=json.dumps(plan_result),
        )
        db.add(new_plan)
        db.commit()
        db.refresh(new_plan)
        plan_id = new_plan.id

    tasks = plan_result.get("tasks", [])
    total_minutes = sum(t.get("duration_minutes", 15) for t in tasks)

    return StudyPlanResponse(
        plan_id=plan_id,
        subject_id=subj.id,
        exam_date=body.exam_date,
        daily_hours=body.daily_hours,
        mode=body.mode,
        total_scheduled_minutes=total_minutes,
        total_topics_covered=len(tasks),
        tasks=tasks,
    )


@router.post("/plan/{plan_id}/task/{task_id}/toggle")
async def toggle_plan_task(
    plan_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Toggle completion status of a specific task in an authenticated user's study plan."""
    user_id = _current_user.get("id") if _current_user else "guest_user"
    plan = db.query(StudyPlan).filter(StudyPlan.id == plan_id, StudyPlan.user_id == user_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study plan not found.")

    data = json.loads(plan.schedule_data) if plan.schedule_data else {"tasks": []}
    tasks = data.get("tasks", [])
    task_found = False
    task_completed = False

    for t in tasks:
        if t.get("task_id") == task_id or t.get("id") == task_id:
            t["completed"] = not t.get("completed", False)
            task_completed = t["completed"]
            task_found = True
            break

    if not task_found:
        # If task_id is 1-based index
        if 1 <= task_id <= len(tasks):
            t = tasks[task_id - 1]
            t["completed"] = not t.get("completed", False)
            task_completed = t["completed"]
            task_found = True

    if not task_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task {task_id} not found in plan.")

    plan.schedule_data = json.dumps(data)
    db.commit()
    return {"status": "success", "task_completed": task_completed}


@router.post("/mock-exam", response_model=MockExamResponse)
async def get_mock_exam(
    request: Request,
    body: MockExamRequest,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Synthesize a university-patterned grounded mock exam."""
    ai_rate_limiter.check(request)
    user_id = _current_user.get("id") if _current_user else "guest_user"
    subj = _resolve_subject(db, body.subject_id, body.subject_name)

    try:
        raw_paper = await generate_university_mock_exam(
            db=db,
            user_id=user_id,
            subject_id=subj.id,
            total_marks=70,
        )
    except StudyGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Mock exam generator unavailable: {str(exc)}. Please retry.",
        )

    return MockExamResponse(
        exam_id=f"exam_{subj.id}_{int(datetime.now(timezone.utc).timestamp())}",
        subject=subj.name,
        university_pattern="JNTU R22 Pattern (Part A Compulsory Short + Part B In-Depth Analytical)",
        total_marks=raw_paper.get("total_marks", 70),
        duration_minutes=raw_paper.get("duration_minutes", 180),
        instructions=[
            "Part A: Answer all compulsory questions (2 marks each).",
            "Part B: Answer deep analytical/architectural questions (10 marks each) with clear diagrams.",
            "All questions strictly grounded in your syllabus curriculum.",
        ],
        part_a=raw_paper.get("part_a", []),
        part_b=raw_paper.get("part_b", []),
    )


@router.post("/mock-exam/submit", response_model=MockExamSubmitResponse)
async def submit_mock_exam_endpoint(
    body: MockExamSubmitRequest,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Submit student answers to a mock exam and evaluate against marking rubrics."""
    user_id = _current_user.get("id") if _current_user else "guest_user"
    subj = _resolve_subject(db, body.subject_id, body.subject_name)

    eval_result = await submit_mock_exam(
        db=db,
        user_id=user_id,
        subject_id=subj.id,
        exam_id=body.exam_id,
        answers=[a.model_dump() for a in body.answers],
    )

    return MockExamSubmitResponse(
        exam_id=eval_result["exam_id"],
        total_score=eval_result["total_score"],
        max_marks=eval_result["max_marks"],
        percentage=eval_result["percentage"],
        overall_feedback=eval_result["overall_feedback"],
        evaluations=eval_result["evaluations"],
    )
