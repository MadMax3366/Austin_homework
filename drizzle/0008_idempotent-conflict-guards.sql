DROP TRIGGER IF EXISTS `trg_lesson_session_conflict_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_lesson_session_conflict_insert`
BEFORE INSERT ON `lesson_sessions`
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM lesson_sessions existing
  WHERE existing.id<>NEW.id
    AND existing.teacher_id=NEW.teacher_id
    AND existing.session_date=NEW.session_date
    AND existing.status<>'cancelled'
    AND existing.local_start_time<NEW.local_end_time
    AND NEW.local_start_time<existing.local_end_time
)
BEGIN SELECT RAISE(ABORT, 'TEACHER_SCHEDULE_CONFLICT'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_room_conflict_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_room_conflict_insert`
BEFORE INSERT ON `lesson_sessions`
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM lesson_sessions existing
  JOIN class_series existing_series ON existing_series.id=existing.class_series_id
  JOIN class_series new_series ON new_series.id=NEW.class_series_id
  WHERE existing.id<>NEW.id
    AND existing_series.room=new_series.room
    AND existing.session_date=NEW.session_date
    AND existing.status<>'cancelled'
    AND existing.local_start_time<NEW.local_end_time
    AND NEW.local_start_time<existing.local_end_time
)
BEGIN SELECT RAISE(ABORT, 'ROOM_SCHEDULE_CONFLICT'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_participant_schedule_conflict`;--> statement-breakpoint
CREATE TRIGGER `trg_participant_schedule_conflict`
BEFORE INSERT ON `session_participants`
WHEN EXISTS (
  SELECT 1 FROM session_participants existing_participant
  JOIN lesson_sessions existing_session
    ON existing_session.id=existing_participant.lesson_session_id
  JOIN lesson_sessions new_session ON new_session.id=NEW.lesson_session_id
  WHERE existing_participant.id<>NEW.id
    AND existing_participant.student_id=NEW.student_id
    AND existing_participant.removed_at IS NULL
    AND existing_session.id<>new_session.id
    AND existing_session.session_date=new_session.session_date
    AND existing_session.status<>'cancelled' AND new_session.status<>'cancelled'
    AND existing_session.local_start_time<new_session.local_end_time
    AND new_session.local_start_time<existing_session.local_end_time
)
BEGIN SELECT RAISE(ABORT, 'STUDENT_SCHEDULE_CONFLICT'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_session_capacity`;--> statement-breakpoint
CREATE TRIGGER `trg_session_capacity`
BEFORE INSERT ON `session_participants`
WHEN NOT EXISTS (
  SELECT 1 FROM session_participants WHERE id=NEW.id
) AND (
  SELECT COUNT(*) FROM session_participants existing
  WHERE existing.lesson_session_id=NEW.lesson_session_id
    AND existing.removed_at IS NULL
) >= (
  SELECT series.capacity FROM lesson_sessions session
  JOIN class_series series ON series.id=session.class_series_id
  WHERE session.id=NEW.lesson_session_id
)
BEGIN SELECT RAISE(ABORT, 'CLASS_CAPACITY_EXCEEDED'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_participant_insert_frozen`;--> statement-breakpoint
CREATE TRIGGER `trg_participant_insert_frozen`
BEFORE INSERT ON `session_participants`
WHEN NOT EXISTS (
  SELECT 1 FROM session_participants WHERE id=NEW.id
) AND EXISTS (
  SELECT 1 FROM `lesson_sessions` AS session
  WHERE session.id = NEW.lesson_session_id
    AND (session.roster_frozen_at IS NOT NULL OR session.status <> 'scheduled')
)
BEGIN
  SELECT RAISE(ABORT, 'SESSION_ROSTER_IS_FROZEN');
END;
