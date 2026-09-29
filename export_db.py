import sqlite3
import json
import os

DB_FILE = 'virvideos.db'
OUTPUT_DIR = os.path.join('public', 'data')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'videos.json')

def export_videos():
    if not os.path.exists(DB_FILE):
        print(f"Error: {DB_FILE} not found.")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    query = """
        SELECT 
            id,
            video_id,
            title,
            duration,
            views,
            thumbnail_url,
            video_url,
            url,
            categories,
            tags
        FROM videos
        WHERE is_active = 1 OR is_active IS NULL
        ORDER BY id DESC
        LIMIT 1000
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    videos = []
    for r in rows:
        vid_id, video_id, title, duration, views, thumb, video_url, page_url, cats, tags = r
        
        # Parse categories/tags if json string
        category_list = []
        if cats:
            try:
                category_list = json.loads(cats) if isinstance(cats, str) else cats
            except Exception:
                category_list = []

        # Target playable source URL
        stream_url = video_url if video_url else page_url

        videos.append({
            "id": vid_id,
            "videoId": video_id,
            "title": title or f"Video #{vid_id}",
            "duration": duration or 0,
            "views": views or 0,
            "thumbnail": thumb or "/images/default-thumb.jpg",
            "streamUrl": stream_url,
            "categories": category_list
        })

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)

    print(f"Successfully exported {len(videos)} videos to {OUTPUT_FILE}")
    conn.close()

if __name__ == '__main__':
    export_videos()
