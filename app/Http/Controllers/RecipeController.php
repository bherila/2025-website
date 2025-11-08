<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Parsedown;
use Symfony\Component\Yaml\Yaml;

class RecipeController extends Controller
{
    public function index()
    {
        $data = $this->getAllRecipes();
        return view('recipes.index', $data);
    }

    public function show($slug)
    {
        $filePath = resource_path('markdown/recipes/' . $slug . '.md');

        if (!File::exists($filePath)) {
            abort(404, 'Recipe not found.');
        }

        $markdownContent = File::get($filePath);
        $parsed = $this->parseMarkdownWithFrontmatter($markdownContent);
        $data = $parsed['frontmatter'];
        $content = $parsed['content'];

        $allData = $this->getAllRecipes();
        $allRecipes = $allData['recipes'];

        $firstCategory = $data['categories'][0] ?? null;
        $relatedRecipes = $firstCategory
            ? array_filter($allRecipes, function ($recipe) use ($slug, $firstCategory) {
                return $recipe['slug'] !== $slug && in_array($firstCategory, $recipe['categories']);
            })
            : [];

        return view('recipes.show', [
            'data' => $data,
            'content' => $content,
            'relatedRecipes' => array_values($relatedRecipes),
            'slug' => $slug,
        ]);
    }

    private function getAllRecipes()
    {
        $recipesPath = resource_path('markdown/recipes');
        $files = File::files($recipesPath);

        $recipes = [];
        $categories = []; // Use array to collect unique categories

        foreach ($files as $file) {
            $slug = $file->getBasename('.md');
            $content = File::get($file->getPathname());
            $parsed = $this->parseMarkdownWithFrontmatter($content);

            $recipeCategories = $parsed['frontmatter']['categories'] ?? [];
            foreach ($recipeCategories as $category) {
                if (!in_array($category, $categories)) {
                    $categories[] = $category;
                }
            }

            $recipes[] = [
                'slug' => $slug,
                'title' => $parsed['frontmatter']['title'] ?? ucfirst(str_replace('-', ' ', $slug)),
                'categories' => $recipeCategories,
                'images' => $parsed['frontmatter']['images'] ?? [],
            ];
        }

        // Sort recipes by title, similar to the Next.js version
        usort($recipes, function ($a, $b) {
            return $a['title'] <=> $b['title'];
        });

        sort($categories); // Sort categories alphabetically

        return ['recipes' => $recipes, 'categories' => $categories];
    }

    /**
     * Parses markdown content and extracts YAML frontmatter.
     * Assumes frontmatter is at the beginning of the file, delimited by '---'.
     */
    private function parseMarkdownWithFrontmatter(string $markdownContent): array
    {
        $frontmatter = [];
        $content = $markdownContent;

        if (preg_match('/^---\s*\n(.*?)\n---\s*\n(.*)/s', $markdownContent, $matches)) {
            $frontmatter = Yaml::parse($matches[1]);
            $content = $matches[2];
        }

        return [
            'frontmatter' => $frontmatter,
            'content' => $content,
        ];
    }
}
