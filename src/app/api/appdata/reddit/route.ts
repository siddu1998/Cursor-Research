import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { query, maxResults = 25, clientId, clientSecret } = await req.json();

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Reddit Client ID and Client Secret are required. Add them in Settings.' },
        { status: 400 }
      );
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Search query is required.' },
        { status: 400 }
      );
    }

    const clampedMax = Math.min(Math.max(maxResults, 5), 100);

    // Step 1: Get an access token using client credentials
    const authResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'InsightBoard/1.0',
      },
      body: 'grant_type=client_credentials',
    });

    if (!authResponse.ok) {
      const errorBody = await authResponse.text();
      console.error('Reddit auth error:', authResponse.status, errorBody);
      return NextResponse.json(
        { error: 'Reddit authentication failed. Check your Client ID and Secret in Settings.' },
        { status: 401 }
      );
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to obtain Reddit access token.' },
        { status: 401 }
      );
    }

    // Step 2: Search posts
    const params = new URLSearchParams({
      q: query,
      limit: String(clampedMax),
      sort: 'relevance',
      t: 'month',
      type: 'link',
    });

    const searchResponse = await fetch(
      `https://oauth.reddit.com/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'InsightBoard/1.0',
        },
      }
    );

    if (!searchResponse.ok) {
      const errorBody = await searchResponse.text();
      console.error('Reddit search error:', searchResponse.status, errorBody);
      return NextResponse.json(
        { error: `Reddit API error (${searchResponse.status})` },
        { status: searchResponse.status }
      );
    }

    const searchData = await searchResponse.json();

    // Transform posts
    const posts = (searchData.data?.children || []).map((child: {
      data: {
        id: string;
        title: string;
        selftext: string;
        author: string;
        subreddit: string;
        score: number;
        num_comments: number;
        created_utc: number;
        permalink: string;
      };
    }) => {
      const post = child.data;
      const content = post.selftext
        ? `${post.title}\n\n${post.selftext}`
        : post.title;

      return {
        id: post.id,
        text: content.slice(0, 2000), // Cap content length
        authorName: post.author,
        subreddit: post.subreddit,
        score: post.score,
        comments: post.num_comments,
        createdAt: new Date(post.created_utc * 1000).toISOString(),
      };
    });

    return NextResponse.json({
      posts,
      resultCount: posts.length,
      query,
    });
  } catch (err) {
    console.error('Reddit search error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
