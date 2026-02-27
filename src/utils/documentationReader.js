import fs from 'fs';
import path from 'path';

/**
 * Advanced Documentation Reader Utility
 * Handles markdown parsing and document management
 */
export class DocumentationReader {
    constructor() {
        this.docsPath = path.join(process.cwd(), 'docs');
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Read and parse a markdown file
     */
    async readDocument(filename) {
        const filePath = path.join(this.docsPath, filename);
        
        // Check cache first
        const cached = this.cache.get(filePath);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.content;
        }

        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`Document ${filename} not found`);
            }

            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = this.parseMarkdown(content);
            
            // Cache the result
            this.cache.set(filePath, {
                content: parsed,
                timestamp: Date.now()
            });

            return parsed;
        } catch (error) {
            console.error(`Error reading document ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Parse markdown content into structured format
     */
    parseMarkdown(content) {
        const lines = content.split('\n');
        const sections = [];
        let currentSection = null;
        let frontmatter = {};

        // Extract frontmatter if present
        if (lines[0] === '---') {
            const endIndex = lines.indexOf('---', 1);
            if (endIndex !== -1) {
                const frontmatterLines = lines.slice(1, endIndex);
                frontmatterLines.forEach(line => {
                    const [key, ...values] = line.split(':');
                    if (key && values.length) {
                        frontmatter[key.trim()] = values.join(':').trim();
                    }
                });
                lines.splice(0, endIndex + 1);
            }
        }

        // Parse sections
        lines.forEach((line, index) => {
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            
            if (headingMatch) {
                // Save previous section
                if (currentSection) {
                    sections.push(currentSection);
                }
                
                // Start new section
                currentSection = {
                    level: headingMatch[1].length,
                    title: headingMatch[2].trim(),
                    content: [],
                    rawContent: ''
                };
            } else if (currentSection) {
                currentSection.content.push(line);
                currentSection.rawContent += line + '\n';
            }
        });

        // Save last section
        if (currentSection) {
            sections.push(currentSection);
        }

        return {
            frontmatter,
            sections,
            rawContent: content,
            metadata: {
                wordCount: content.split(/\s+/).length,
                readingTime: Math.ceil(content.split(/\s+/).length / 200),
                lastModified: fs.existsSync(path.join(this.docsPath, filename)) 
                    ? fs.statSync(path.join(this.docsPath, filename)).mtime 
                    : null
            }
        };
    }

    /**
     * Search for content across all documents
     */
    async searchDocuments(query, options = {}) {
        const { limit = 10, filename = null } = options;
        const results = [];
        
        try {
            const files = filename ? [filename] : fs.readdirSync(this.docsPath).filter(f => f.endsWith('.md'));
            
            for (const file of files) {
                try {
                    const doc = await this.readDocument(file);
                    const matches = this.searchInDocument(doc, query);
                    
                    if (matches.length > 0) {
                        results.push({
                            filename: file,
                            matches,
                            relevance: this.calculateRelevance(matches, query)
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to search in ${file}:`, error.message);
                }
            }

            return results
                .sort((a, b) => b.relevance - a.relevance)
                .slice(0, limit);
                
        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    }

    /**
     * Search within a single document
     */
    searchInDocument(doc, query) {
        const matches = [];
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        
        doc.sections.forEach((section, index) => {
            const contentMatch = section.rawContent.match(regex);
            const titleMatch = section.title.match(regex);
            
            if (contentMatch || titleMatch) {
                matches.push({
                    sectionIndex: index,
                    title: section.title,
                    level: section.level,
                    context: this.extractContext(section.rawContent, query),
                    titleMatch: !!titleMatch,
                    contentMatches: contentMatch ? contentMatch.length : 0
                });
            }
        });

        return matches;
    }

    /**
     * Extract context around search term
     */
    extractContext(content, query, contextLength = 100) {
        const index = content.toLowerCase().indexOf(query.toLowerCase());
        if (index === -1) return '';
        
        const start = Math.max(0, index - contextLength);
        const end = Math.min(content.length, index + query.length + contextLength);
        
        let context = content.substring(start, end);
        if (start > 0) context = '...' + context;
        if (end < content.length) context = context + '...';
        
        return context;
    }

    /**
     * Calculate relevance score for search results
     */
    calculateRelevance(matches, query) {
        let score = 0;
        matches.forEach(match => {
            if (match.titleMatch) score += 10;
            score += match.contentMatches * 2;
            score += (6 - match.level) * 2; // Higher level headings get more points
        });
        return score;
    }

    /**
     * Get table of contents for a document
     */
    async getTableOfContents(filename) {
        const doc = await this.readDocument(filename);
        return doc.sections
            .filter(section => section.level <= 3) // Only up to H3
            .map(section => ({
                level: section.level,
                title: section.title,
                anchor: this.createAnchor(section.title)
            }));
    }

    /**
     * Create URL-friendly anchor from title
     */
    createAnchor(title) {
        return title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get list of available documents
     */
    listDocuments() {
        try {
            if (!fs.existsSync(this.docsPath)) {
                fs.mkdirSync(this.docsPath, { recursive: true });
                return [];
            }
            
            return fs.readdirSync(this.docsPath)
                .filter(file => file.endsWith('.md'))
                .map(file => ({
                    filename: file,
                    name: file.replace('.md', ''),
                    path: path.join(this.docsPath, file)
                }));
        } catch (error) {
            console.error('Failed to list documents:', error);
            return [];
        }
    }
}

export const documentationReader = new DocumentationReader();