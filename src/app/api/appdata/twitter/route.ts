import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { query, maxResults = 20, bearerToken } = await req.json();

    if (!bearerToken) {
      return NextResponse.json(
        { error: 'Twitter Bearer Token is required. Add it in Settings.' },
        { status: 400 }
      );
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Search query is required.' },
        { status: 400 }
      );
    }

    const clampedMax = Math.min(Math.max(maxResults, 10), 100);

    // Twitter API v2 - Recent search
    const params = new URLSearchParams({
      query: query,
      max_results: String(clampedMax),
      'tweet.fields': 'author_id,created_at,public_metrics,text',
      expansions: 'author_id',
      'user.fields': 'name,username',
    });

    const response = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Twitter API error:', response.status, errorBody);

      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Invalid Twitter Bearer Token. Check your credentials in Settings.' },
          { status: 401 }
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'Twitter rate limit exceeded. Please try again in a few minutes.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: `Twitter API error (${response.status}): ${errorBody}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Build a user lookup map
    const userMap = new Map<string, { name: string; username: string }>();
    if (data.includes?.users) {
      for (const user of data.includes.users) {
        userMap.set(user.id, { name: user.name, username: user.username });
      }
    }

    // Transform tweets into a simpler format
    const tweets = (data.data || []).map((tweet: {
      id: string;
      text: string;
      author_id: string;
      created_at?: string;
      public_metrics?: {
        like_count: number;
        retweet_count: number;
        reply_count: number;
      };
    }) => {
      const user = userMap.get(tweet.author_id);
      return {
        id: tweet.id,
        text: tweet.text,
        authorName: user?.name || 'Unknown',
        authorUsername: user?.username || 'unknown',
        createdAt: tweet.created_at,
        likes: tweet.public_metrics?.like_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0,
        replies: tweet.public_metrics?.reply_count || 0,
      };
    });

    return NextResponse.json({
      tweets,
      resultCount: tweets.length,
      query,
    });
  } catch (err) {
    console.error('Twitter search error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
