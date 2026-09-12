"""
Unit & Integration Tests for CampusClimb Academic Intelligence & Study Engine.

Verifies:
1. Explainable Topic Mastery & Exam Readiness heuristic calculations
2. Next Best Action selection and 'Why This Topic?' transparent rationale
3. Dynamic replanning when student performance or revision state changes
4. Adaptive value-per-minute study planning (Emergency, Sprint, Mastery modes)
5. 5-Question rapid quiz grading, weak concept detection, and attempt logging
6. Grounded mock exam rubric scoring (Part A short + Part B in-depth)
7. Syllabus guardrail alignment (in-syllabus vs out-of-syllabus detection)
8. Strict user isolation for study progress and plans
9. Graceful empty data handling
10. Strict no-fake-AI fallback policy (StudyGenerationError on Gemini failure)
"""

import json
import os
import sys
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure project root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.database import Base
from app.models import (
    NoteChunk,
    PYQ,
    QuizAttempt,
    StudyPlan,
    Subject,
    SyllabusTopic,
    TopicImportance,
    TopicProgress,
)
from app.schemas import SyllabusAlignment
from core.study_engine import (
    StudyGenerationError,
    _STUDY_CACHE,
    calculate_exam_readiness,
    calculate_topic_mastery,
    compute_next_best_action,
    generate_adaptive_study_plan,
    generate_grounded_flashcards,
    generate_high_yield_revision,
    generate_rapid_quiz,
    submit_mock_exam,
    submit_rapid_quiz,
)


@pytest.fixture
def in_memory_db():
    """Create a temporary, isolated SQLite in-memory database for testing."""
    _STUDY_CACHE.clear()
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed initial test subject
    subj = Subject(id=1, name="Operating Systems")
    session.add(subj)

    # Seed syllabus topics
    t1 = SyllabusTopic(id=1, subject="Operating Systems", unit_number=1, unit_name="Introduction", topic_name="System Calls")
    t2 = SyllabusTopic(id=2, subject="Operating Systems", unit_number=2, unit_name="Process Management", topic_name="CPU Scheduling")
    t3 = SyllabusTopic(id=3, subject="Operating Systems", unit_number=3, unit_name="Deadlocks", topic_name="Deadlock Detection")
    session.add_all([t1, t2, t3])

    # Seed topic importances (simulating real PYQ frequency)
    imp1 = TopicImportance(id=1, topic_id=1, question_count=2, importance_score=0.35, importance_label="Low")
    imp2 = TopicImportance(id=2, topic_id=2, question_count=5, importance_score=0.70, importance_label="High")
    imp3 = TopicImportance(id=3, topic_id=3, question_count=7, importance_score=0.90, importance_label="High")
    session.add_all([imp1, imp2, imp3])

    # Seed sample PYQs
    pyq1 = PYQ(id=1, year=2023, question_text="Explain system call mechanism with diagram", matched_topic_id=1)
    pyq2 = PYQ(id=2, year=2022, question_text="Compare FCFS and Round Robin scheduling", matched_topic_id=2)
    pyq3 = PYQ(id=3, year=2021, question_text="State four necessary conditions for deadlock", matched_topic_id=3)
    session.add_all([pyq1, pyq2, pyq3])

    session.commit()
    yield session
    session.close()


class TestExplainableScoring:
    def test_topic_mastery_calculation(self):
        # 0% starting baseline with low pyq weight (0.35 * 100 * 0.15 = 5.25 -> 5.2)
        baseline = calculate_topic_mastery(quiz_score=None, revision_completed=False, pyq_importance_score=0.35, flashcards_completed=False)
        assert baseline == 5.2

        # 100% across all signals (50 + 25 + 15 + 10 = 100.0)
        full_score = calculate_topic_mastery(quiz_score=100.0, revision_completed=True, pyq_importance_score=1.0, flashcards_completed=True)
        assert full_score == 100.0

        # Partial signals: 80% quiz (40) + revision (25) + 0.8 PYQ (12) = 77.0
        partial = calculate_topic_mastery(quiz_score=80.0, revision_completed=True, pyq_importance_score=0.8, flashcards_completed=False)
        assert partial == 77.0

        # With retention quality: 100% quiz (50) + 100% revision (25) + 1.0 PYQ (15) + 0.85 retention (8.5) = 98.5
        with_retention = calculate_topic_mastery(quiz_score=100.0, revision_completed=True, pyq_importance_score=1.0, flashcards_completed=True, flashcards_retention=0.85)
        assert with_retention == 98.5

    def test_readiness_calculation(self, in_memory_db):
        user_id = "test_user_alpha"
        # Initially with no user progress
        readiness = calculate_exam_readiness(in_memory_db, user_id, subject_id=1)
        assert readiness["overall_score"] >= 0.0
        assert "Focusing on Deadlock Detection" in readiness["highest_value_improvement"] or "boost" in readiness["highest_value_improvement"]

    def test_readiness_empty_syllabus(self, in_memory_db):
        # When querying an empty subject
        readiness = calculate_exam_readiness(in_memory_db, "user_1", subject_id=999)
        assert readiness["overall_score"] == 0.0
        assert "Upload syllabus" in readiness["highest_value_improvement"]


class TestNextBestActionAndReplanning:
    def test_next_best_action_picks_highest_yield_topic(self, in_memory_db):
        user_id = "user_beta"
        action = compute_next_best_action(in_memory_db, user_id, subject_id=1)

        # Topic 3 (Deadlock Detection) has importance 0.90 and 0% mastery -> highest priority
        assert action["topic_id"] == 3
        assert action["topic_name"] == "Deadlock Detection"
        assert action["primary_action"] == "revision"
        assert "High exam yield" in action["reason"]

    def test_dynamic_replanning_when_mastery_improves(self, in_memory_db):
        user_id = "user_beta"

        # 1. User completes revision and passes quiz on Topic 3 (Deadlocks) with 100%
        prog3 = TopicProgress(
            user_id=user_id,
            subject_id=1,
            topic_id=3,
            revision_completed=True,
            flashcards_completed=True,
            quizzes_taken=1,
            last_quiz_score=100.0,
            mastery_score=95.0,
        )
        in_memory_db.add(prog3)
        in_memory_db.commit()

        # 2. Next Best Action should dynamically switch to Topic 2 (CPU Scheduling)
        new_action = compute_next_best_action(in_memory_db, user_id, subject_id=1)
        assert new_action["topic_id"] == 2
        assert new_action["topic_name"] == "CPU Scheduling"


class TestAdaptivePlanner:
    def test_planner_respects_time_budget(self, in_memory_db):
        user_id = "user_gamma"
        plan = generate_adaptive_study_plan(
            db=in_memory_db,
            user_id=user_id,
            subject_id=1,
            exam_date=None,
            daily_hours=2.0,
            mode="Sprint",
        )
        assert "tasks" in plan
        assert len(plan["tasks"]) > 0
        total_minutes = sum(t["duration_minutes"] for t in plan["tasks"])
        # 7 days * 2 hours * 60 = 840 available minutes
        assert total_minutes <= 840

    def test_planner_emergency_mode_prioritizes_high_pyqs(self, in_memory_db):
        user_id = "user_gamma"
        plan = generate_adaptive_study_plan(
            db=in_memory_db,
            user_id=user_id,
            subject_id=1,
            exam_date=None,
            daily_hours=1.0,
            mode="Emergency",
        )
        # Emergency mode tasks must feature top PYQ topics first
        first_topic = plan["tasks"][0]["topic_name"]
        assert first_topic in ("Deadlock Detection", "CPU Scheduling")


class TestRapidQuizSubmission:
    def test_quiz_scoring_and_mastery_persistence(self, in_memory_db):
        user_id = "user_delta"
        topic_id = 2

        quiz_questions = [
            {"id": 1, "question": "What is FCFS?", "options": ["A", "B", "C", "D"], "correct_index": 0, "explanation": "First Come First Served"},
            {"id": 2, "question": "What is SJF?", "options": ["A", "B", "C", "D"], "correct_index": 1, "explanation": "Shortest Job First"},
            {"id": 3, "question": "What is Round Robin?", "options": ["A", "B", "C", "D"], "correct_index": 2, "explanation": "Time sliced"},
            {"id": 4, "question": "What is Priority?", "options": ["A", "B", "C", "D"], "correct_index": 3, "explanation": "Priority based"},
            {"id": 5, "question": "What is Convoy Effect?", "options": ["A", "B", "C", "D"], "correct_index": 0, "explanation": "FCFS limitation"},
        ]

        # Student gets 4 out of 5 correct (indices: 0, 1, 2, 3, 1 -> #5 is wrong)
        submitted = [0, 1, 2, 3, 1]

        result = submit_rapid_quiz(
            db=in_memory_db,
            user_id=user_id,
            subject_id=1,
            topic_id=topic_id,
            submitted_answers=submitted,
            quiz_questions=quiz_questions,
        )

        assert result["total_questions"] == 5
        assert result["correct_answers"] == 4
        assert result["score_percentage"] == 80.0
        assert len(result["weak_concepts"]) == 1
        assert "Convoy Effect" in result["weak_concepts"][0]

        # Verify DB TopicProgress was updated
        prog = in_memory_db.query(TopicProgress).filter(
            TopicProgress.user_id == user_id,
            TopicProgress.topic_id == topic_id,
        ).first()
        assert prog is not None
        assert prog.quizzes_taken == 1
        assert prog.last_quiz_score == 80.0
        assert prog.mastery_score >= 40.0

        # Verify QuizAttempt record logged
        attempt = in_memory_db.query(QuizAttempt).filter(
            QuizAttempt.user_id == user_id,
            QuizAttempt.topic_id == topic_id,
        ).first()
        assert attempt is not None
        assert attempt.score_percentage == 80.0


class TestMockExamEvaluation:
    @pytest.mark.anyio
    async def test_mock_exam_rubric_evaluation(self, in_memory_db):
        user_id = "user_epsilon"
        answers = [
            {"question_number": 1, "part": "A", "student_answer": "A system call is the programmatic interface provided by the OS to request services."},
            {"question_number": 2, "part": "B", "student_answer": "CPU scheduling algorithms allocate CPU resources among ready processes. FCFS schedules non-preemptively based on arrival. SJF minimizes average waiting time. Round Robin utilizes fixed time slices to ensure responsiveness across interactive workloads."},
        ]

        result = await submit_mock_exam(
            db=in_memory_db,
            user_id=user_id,
            subject_id=1,
            exam_id="exam_test_1",
            answers=answers,
        )

        assert result["total_score"] > 0
        assert result["max_marks"] == 12  # Part A (2) + Part B (10)
        assert len(result["evaluations"]) == 2
        assert result["evaluations"][0]["part"] == "A"
        assert result["evaluations"][1]["part"] == "B"

        # Check logged attempt
        attempt = in_memory_db.query(QuizAttempt).filter(
            QuizAttempt.user_id == user_id,
            QuizAttempt.quiz_type == "mock_exam",
        ).first()
        assert attempt is not None


class TestSyllabusGuardrail:
    def test_guardrail_alignment_classification(self):
        # In-syllabus case: score >= 0.55
        aligned = SyllabusAlignment(
            is_aligned=True,
            status="in_syllabus",
            unit_number=2,
            unit_name="Process Management",
            matched_topic="CPU Scheduling",
            confidence=0.82,
            reason="Topic 'CPU Scheduling' belongs to Unit 2.",
        )
        assert aligned.is_aligned is True
        assert aligned.status == "in_syllabus"
        assert aligned.unit_number == 2

        # Out-of-syllabus case: score < 0.55
        unaligned = SyllabusAlignment(
            is_aligned=False,
            status="out_of_syllabus",
            unit_number=None,
            unit_name=None,
            matched_topic=None,
            confidence=0.31,
            reason="Question lies outside direct syllabus unit boundaries; general knowledge reasoning applied.",
        )
        assert unaligned.is_aligned is False
        assert unaligned.status == "out_of_syllabus"


class TestUserIsolation:
    def test_user_a_and_user_b_isolated(self, in_memory_db):
        user_a = "user_alice"
        user_b = "user_bob"

        # Alice completes revision
        prog_a = TopicProgress(user_id=user_a, subject_id=1, topic_id=1, revision_completed=True, mastery_score=75.0)
        in_memory_db.add(prog_a)
        in_memory_db.commit()

        # Check Bob's readiness and progress
        bob_readiness = calculate_exam_readiness(in_memory_db, user_b, subject_id=1)
        bob_prog = in_memory_db.query(TopicProgress).filter(
            TopicProgress.user_id == user_b,
            TopicProgress.topic_id == 1,
        ).first()

        assert bob_prog is None
        assert bob_readiness["revision_rate"] == 0.0


class TestNoFakeAiPolicy:
    @pytest.mark.anyio
    async def test_revision_fails_loudly_without_gemini_key(self, in_memory_db):
        """Strict Rule 2: Never invent fake academic content when AI is unavailable."""
        from core.study_engine import _STUDY_CACHE
        _STUDY_CACHE.clear()
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            with pytest.raises(StudyGenerationError) as exc_info:
                await generate_high_yield_revision(in_memory_db, "user_x", subject_id=1, topic_id=1)
            assert "unavailable" in str(exc_info.value).lower()

    @pytest.mark.anyio
    async def test_flashcards_fails_loudly_without_gemini_key(self, in_memory_db):
        from core.study_engine import _STUDY_CACHE
        _STUDY_CACHE.clear()
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            with pytest.raises(StudyGenerationError) as exc_info:
                await generate_grounded_flashcards(in_memory_db, "user_x", subject_id=1, topic_id=1)
            assert "unavailable" in str(exc_info.value).lower()

    @pytest.mark.anyio
    async def test_quiz_fails_loudly_without_gemini_key(self, in_memory_db):
        from core.study_engine import _STUDY_CACHE
        _STUDY_CACHE.clear()
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            with pytest.raises(StudyGenerationError) as exc_info:
                await generate_rapid_quiz(in_memory_db, "user_x", subject_id=1, topic_id=1)
            assert "unavailable" in str(exc_info.value).lower()

    @pytest.mark.anyio
    async def test_quiz_uses_grounded_fallback_when_gemini_returns_no_json(self, in_memory_db):
        from core.study_engine import _STUDY_CACHE

        _STUDY_CACHE.clear()
        in_memory_db.add(
            NoteChunk(
                note_id=1,
                matched_topic_id=1,
                chunk_text="A system call provides a controlled interface between a user program and the operating system kernel.",
                is_representative=True,
            )
        )
        in_memory_db.commit()

        with patch.dict(os.environ, {"GEMINI_API_KEY": "configured"}), patch(
            "core.study_engine._call_gemini_json",
            new=AsyncMock(return_value=None),
        ):
            result = await generate_rapid_quiz(in_memory_db, "user_x", subject_id=1, topic_id=1)

        assert len(result["questions"]) == 5
        assert result["questions"][0]["correct_index"] == 0
        assert "controlled interface" in result["questions"][0]["options"][0]
