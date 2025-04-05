// API 키와 엔드포인트 설정
const API_KEY = 'd90740b04754401c9bbf4231d898b4d272a4e89f0d6'; // API 키를 여기에 입력하세요
const GOOGLE_API_KEY = 'AIzaSyAZNnaGnwv-wwHmKw_gpEsJo7DSiXcPy64'; // Google 번역 API 키

// 전역 변수로 뉴스 아이템 저장
let newsItems = [];

// API 키 확인
if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
    console.error('API 키가 설정되지 않았습니다. API 키를 입력하세요.');
}

// scrape.do API를 사용하여 VnExpress에서 베트남어 뉴스를 가져오는 함수
async function fetchNewsWithScrapeDo() {
    const url = 'https://vnexpress.net/';

    try {
        const response = await fetch(`https://api.scrape.do/?token=${API_KEY}&url=${encodeURIComponent(url)}`);

        if (response.ok) {
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 뉴스 항목 추출
            const newsItems = [];
            
            // 여러 선택자를 시도하여 뉴스 항목을 찾습니다
            const selectors = [
                'article.item-news',
                '.thumb-art',
                '.sidebar_1 .thumb-art',
                '.thumb-art .title-news',
                '.sidebar_1 .thumb-art .title-news',
                '.thumb-art a',
                '.sidebar_1 .thumb-art a',
                'h3.title-news a',
                '.title-news a',
                'h3 a',
                '.title a',
                'a[href*="/"]'
            ];
            
            for (const selector of selectors) {
                const elements = doc.querySelectorAll(selector);
                
                if (elements.length > 0) {
                    elements.forEach(element => {
                        // 링크와 제목 찾기
                        let titleElement, linkElement;
                        
                        if (element.tagName === 'A') {
                            linkElement = element;
                            titleElement = element;
                        } else {
                            linkElement = element.querySelector('a');
                            titleElement = element.querySelector('.title-news, .title, h3, h2') || element;
                        }
                        
                        if (linkElement && titleElement) {
                            const id = linkElement.href || '';
                            const title = titleElement.textContent.trim() || '';
                            const link = linkElement.href || '';
                            
                            // 유효한 링크인지 확인 (vnexpress.net 도메인)
                            if (id && link.includes('vnexpress.net') && title.length > 10) {
                                // 중복 확인
                                if (!newsItems.some(item => item.id === id)) {
                                    newsItems.push({
                                        id,
                                        title,
                                        link,
                                        date: new Date().toLocaleDateString() // 임시로 현재 날짜 사용
                                    });
                                }
                            }
                        }
                    });
                    
                    // 충분한 뉴스 항목을 찾았으면 중단
                    if (newsItems.length >= 10) break;
                }
            }

            // 최신 10개만 반환
            return newsItems.slice(0, 10);
        } else {
            throw new Error('Scrape.do API 호출 실패');
        }
    } catch (error) {
        console.error('뉴스를 가져오는 중 오류가 발생했습니다:', error);
        return [];
    }
}

// 뉴스 상세 내용을 가져오는 함수
async function fetchNewsDetail(url) {
    try {
        // URL이 상대 경로인 경우 기본 URL 추가
        const fullUrl = url.startsWith('http') ? url : `https://vnexpress.net${url}`;
        
        const response = await fetch(`https://api.scrape.do/?token=${API_KEY}&url=${encodeURIComponent(fullUrl)}`, {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'vi,en-US;q=0.7,en;q=0.3',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (response.ok) {
            const html = await response.text();
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 제목 추출 (여러 선택자 시도)
            let title = '';
            const titleSelectors = [
                'h1.title-detail',
                'h1.title-news',
                'h1',
                '.title-detail',
                '.title-news',
                '.article-title',
                '.detail-title'
            ];
            
            for (const selector of titleSelectors) {
                const titleElement = doc.querySelector(selector);
                if (titleElement) {
                    title = titleElement.textContent.trim();
                    break;
                }
            }
            
            // 본문 추출 (여러 선택자 시도)
            let content = '';
            const contentSelectors = [
                '.fck_detail',
                '.detail-content',
                '.article-content',
                '.content-detail',
                '.detail-body',
                '.article-body',
                '.content'
            ];
            
            for (const selector of contentSelectors) {
                const contentElement = doc.querySelector(selector);
                if (contentElement) {
                    // 불필요한 요소 제거
                    const removeSelectors = [
                        '.banner',
                        '.box-tinlienquan',
                        '.social-box',
                        '.advertisement',
                        '.related-news',
                        '.tags',
                        '.author',
                        '.share-group'
                    ];
                    
                    removeSelectors.forEach(removeSelector => {
                        contentElement.querySelectorAll(removeSelector).forEach(el => el.remove());
                    });
                    
                    content = contentElement.textContent.trim();
                    break;
                }
            }
            
            if (!title && !content) {
                throw new Error('뉴스 내용을 찾을 수 없습니다');
            }
            
            return { title, content };
        } else {
            throw new Error(`API 호출 실패: ${response.status}`);
        }
    } catch (error) {
        console.error('뉴스 상세 내용 가져오기 실패:', error);
        throw error;
    }
}

// 번역 함수 (Google Cloud Translation API 사용)
async function translateText(text) {
    if (!text || text.trim() === '') return '';
    
    try {
        // 텍스트가 너무 길면 여러 부분으로 나누어 번역
        if (text.length > 500) {
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
            let translatedParts = [];
            
            // 최대 5개 문장만 번역 (성능 개선)
            const maxSentences = Math.min(sentences.length, 5);
            
            for (let i = 0; i < maxSentences; i++) {
                const sentence = sentences[i].trim();
                if (sentence.length > 0) {
                    try {
                        const translatedSentence = await translateSingleText(sentence);
                        translatedParts.push(translatedSentence);
                    } catch (error) {
                        translatedParts.push(sentence);
                    }
                }
            }
            
            return translatedParts.join('. ');
        } else {
            return await translateSingleText(text);
        }
    } catch (error) {
        console.error('번역 중 오류가 발생했습니다:', error);
        return text;
    }
}

// 단일 텍스트 번역 함수
async function translateSingleText(text) {
    try {
        const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: text,
                source: 'vi',
                target: 'ko',
                format: 'text'
            })
        });
        
        if (!response.ok) {
            throw new Error(`번역 API 오류: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.data && data.data.translations && data.data.translations.length > 0) {
            return data.data.translations[0].translatedText;
        } else {
            throw new Error('번역 결과가 없습니다');
        }
    } catch (error) {
        console.error('단일 텍스트 번역 중 오류:', error);
        throw error;
    }
}

// 뉴스 목록을 화면에 표시하는 함수
async function displayNewsList(news) {
    const newsListContainer = document.querySelector('.news-list');
    
    if (!newsListContainer) {
        console.error('뉴스 목록 컨테이너를 찾을 수 없습니다.');
        return;
    }
    
    if (!news || news.length === 0) {
        newsListContainer.innerHTML = '<p>뉴스를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.</p>';
        return;
    }
    
    // 뉴스 항목을 먼저 표시 (번역 없이)
    newsListContainer.innerHTML = news.map(item => `
        <div class="news-item" data-id="${item.id}">
            <div class="news-date">${item.date || '날짜 없음'}</div>
            <div class="vietnamese-title">${item.title}</div>
            <div class="korean-title">번역 중...</div>
        </div>
    `).join('');
    
    // 각 뉴스 항목의 한국어 제목 번역 (비동기로 처리)
    news.forEach(async (item, index) => {
        try {
            const koreanTitle = await translateText(item.title);
            const newsItem = newsListContainer.children[index];
            if (newsItem) {
                const koreanTitleElement = newsItem.querySelector('.korean-title');
                if (koreanTitleElement) {
                    koreanTitleElement.textContent = koreanTitle;
                }
            }
        } catch (error) {
            console.error(`뉴스 항목 ${index} 번역 중 오류:`, error);
        }
    });
}

// 뉴스 상세 내용을 표시하는 함수
async function displayNewsDetail(newsId) {
    try {
        const newsItem = newsItems.find(item => item.id === newsId);
        if (!newsItem) {
            throw new Error('뉴스를 찾을 수 없습니다');
        }

        // 로딩 표시
        const newsDetailContainer = document.getElementById('newsDetail');
        newsDetailContainer.innerHTML = '<div class="loading">뉴스를 불러오는 중...</div>';

        // 뉴스 상세 내용 가져오기
        const newsDetail = await fetchNewsDetail(newsItem.link);
        
        // 번역
        const translatedTitle = await translateText(newsDetail.title);
        const translatedContent = await translateText(newsDetail.content);

        // HTML 생성 - 베트남어와 한국어를 나란히 표시
        const html = `
            <div class="news-detail">
                <div class="news-meta">
                    <span class="news-date">${newsItem.date || ''}</span>
                    <a href="${newsItem.link}" target="_blank" class="original-link">원본 기사 보기</a>
                </div>
                <div class="news-content-container">
                    <div class="news-content-vietnamese">
                        <h2 class="news-title">${newsDetail.title}</h2>
                        <div class="news-content">${newsDetail.content}</div>
                    </div>
                    <div class="news-content-korean">
                        <h2 class="news-title">${translatedTitle}</h2>
                        <div class="news-content">${translatedContent}</div>
                    </div>
                </div>
            </div>
        `;

        newsDetailContainer.innerHTML = html;
        
        // 단어장 업데이트
        await updateVocabularyList(newsDetail.content);
    } catch (error) {
        console.error('뉴스 상세 내용 표시 중 오류:', error);
        const newsDetailContainer = document.getElementById('newsDetail');
        newsDetailContainer.innerHTML = `<div class="error">뉴스를 불러오는 중 오류가 발생했습니다: ${error.message}</div>`;
    }
}

// 베트남어 텍스트에서 주요 단어를 추출하고 번역하는 함수
async function updateVocabularyList(vietnameseText) {
    try {
        const vocabularyListContainer = document.getElementById('vocabularyList');
        vocabularyListContainer.innerHTML = '<div class="loading">단어를 추출하는 중...</div>';
        
        // 텍스트를 단어로 분리
        const words = vietnameseText.split(/\s+/).filter(word => word.length > 2);
        
        // 단어 빈도 계산
        const wordFrequency = {};
        words.forEach(word => {
            // 특수문자 제거
            const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
            if (cleanWord.length > 2) {
                wordFrequency[cleanWord] = (wordFrequency[cleanWord] || 0) + 1;
            }
        });
        
        // 빈도순으로 정렬
        const sortedWords = Object.entries(wordFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // 상위 10개 단어만 선택 (성능 개선)
        
        // 단어장 HTML 생성
        let vocabularyHtml = '';
        
        // 단어 번역을 병렬로 처리 (성능 개선)
        const translationPromises = sortedWords.map(async ([word, frequency]) => {
            try {
                // 단어 번역
                const translatedWord = await translateSingleText(word);
                
                // 단어가 포함된 문장 예시 찾기
                const exampleSentence = findExampleSentence(vietnameseText, word);
                let translatedExample = '';
                
                if (exampleSentence) {
                    translatedExample = await translateSingleText(exampleSentence);
                }
                
                return {
                    word,
                    translatedWord,
                    exampleSentence,
                    translatedExample
                };
            } catch (error) {
                console.error(`단어 "${word}" 번역 중 오류:`, error);
                return {
                    word,
                    translatedWord: word,
                    exampleSentence: '',
                    translatedExample: ''
                };
            }
        });
        
        const translationResults = await Promise.all(translationPromises);
        
        translationResults.forEach(result => {
            vocabularyHtml += `
                <div class="vocabulary-item">
                    <div class="vocabulary-vietnamese">${result.word}</div>
                    <div class="vocabulary-korean">${result.translatedWord}</div>
                    ${result.exampleSentence ? `<div class="vocabulary-example">${result.exampleSentence} → ${result.translatedExample}</div>` : ''}
                </div>
            `;
        });
        
        vocabularyListContainer.innerHTML = vocabularyHtml || '<div class="placeholder">단어를 찾을 수 없습니다</div>';
    } catch (error) {
        console.error('단어장 업데이트 중 오류:', error);
        const vocabularyListContainer = document.getElementById('vocabularyList');
        vocabularyListContainer.innerHTML = `<div class="error">단어장 업데이트 중 오류가 발생했습니다: ${error.message}</div>`;
    }
}

// 텍스트에서 특정 단어가 포함된 문장을 찾는 함수
function findExampleSentence(text, word) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    for (const sentence of sentences) {
        if (sentence.includes(word)) {
            return sentence.trim();
        }
    }
    return '';
}

// 페이지 로드 시 뉴스 목록 표시
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 뉴스 목록 컨테이너 확인
        const newsListContainer = document.querySelector('.news-list');
        if (!newsListContainer) {
            console.error('뉴스 목록 컨테이너를 찾을 수 없습니다.');
            return;
        }
        
        // 뉴스 상세 컨테이너 확인
        const newsDetailContainer = document.getElementById('newsDetail');
        if (!newsDetailContainer) {
            console.error('뉴스 상세 컨테이너를 찾을 수 없습니다.');
            return;
        }
        
        // 뉴스 데이터 가져오기
        newsItems = await fetchNewsWithScrapeDo();
        
        // 뉴스 목록 표시
        displayNewsList(newsItems);
        
        // 첫 번째 뉴스 항목 자동 선택
        if (newsItems.length > 0) {
            const firstNewsItem = document.querySelector('.news-item');
            if (firstNewsItem) {
                firstNewsItem.classList.add('active');
                displayNewsDetail(newsItems[0].id);
            }
        }
        
        // 뉴스 항목 클릭 이벤트 처리
        const newsList = document.querySelector('.news-list');
        newsList.addEventListener('click', (e) => {
            const newsItem = e.target.closest('.news-item');
            if (newsItem) {
                const newsId = newsItem.dataset.id;
                if (newsId) {
                    displayNewsDetail(newsId);
                    
                    // 클릭한 항목 강조 표시
                    const allItems = document.querySelectorAll('.news-item');
                    allItems.forEach(item => item.classList.remove('active'));
                    newsItem.classList.add('active');
                }
            }
        });
    } catch (error) {
        console.error('페이지 로드 중 오류가 발생했습니다:', error);
        const newsListContainer = document.querySelector('.news-list');
        if (newsListContainer) {
            newsListContainer.innerHTML = '<p class="error">뉴스를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.</p>';
        }
    }
});
