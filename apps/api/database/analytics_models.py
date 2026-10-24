"""Analytics-only mappings; schema is managed exclusively by Alembic."""
from sqlalchemy import BigInteger, Boolean, Column, DateTime, Index, PrimaryKeyConstraint, String, Text
from database.base import Base


class AnalyticsChannelSnapshot(Base):
    __tablename__ = 'analytics_channel_snapshots'
    channel_id = Column(String(64), primary_key=True)
    fetched_at = Column(DateTime(timezone=True), primary_key=True)
    subscriber_count = Column(BigInteger)
    subscriber_count_is_approximate = Column(Boolean, nullable=False)
    view_count = Column(BigInteger)
    video_count = Column(BigInteger)


class AnalyticsVideoSnapshot(Base):
    __tablename__ = 'analytics_video_snapshots'
    channel_id = Column(String(64), nullable=False)
    video_id = Column(String(32), nullable=False)
    fetched_at = Column(DateTime(timezone=True), nullable=False)
    title = Column(Text, nullable=False)
    thumbnail_url = Column(Text)
    view_count = Column(BigInteger)
    __table_args__ = (PrimaryKeyConstraint('channel_id', 'fetched_at', 'video_id'),
                      Index('ix_analytics_video_history', 'channel_id', 'video_id', 'fetched_at'))
