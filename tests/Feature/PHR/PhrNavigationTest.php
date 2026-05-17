<?php

namespace Tests\Feature\PHR;

use Tests\TestCase;

class PhrNavigationTest extends TestCase
{
    public function test_patients_page_renders_for_authenticated_user(): void
    {
        $response = $this->actingAs($this->createUser())->get('/phr/patients');

        $response->assertOk();
        $response->assertViewIs('phr.patients');
        $response->assertSee('PhrNavbar');
    }

    public function test_patient_labs_tab_renders_for_authorized_user(): void
    {
        $owner = $this->createUser();
        $patientResponse = $this->actingAs($owner)->postJson('/api/phr/patients', [
            'display_name' => 'Primary',
            'relationship' => 'self',
        ]);
        $patientId = (int) $patientResponse->json('patient.id');

        $response = $this->actingAs($owner)->get("/phr/patient/{$patientId}/labs");

        $response->assertOk();
        $response->assertViewIs('phr.patient-tab');
        $response->assertSee('data-active-tab="labs"', false);
    }

    public function test_patient_labs_tab_is_not_accessible_to_unshared_user(): void
    {
        $owner = $this->createUser();
        $otherUser = $this->createUser();
        $patientResponse = $this->actingAs($owner)->postJson('/api/phr/patients', [
            'display_name' => 'Primary',
            'relationship' => 'self',
        ]);
        $patientId = (int) $patientResponse->json('patient.id');

        $this->actingAs($otherUser)->get("/phr/patient/{$patientId}/labs")->assertNotFound();
    }

    public function test_phr_root_redirects_to_patients_page(): void
    {
        $response = $this->actingAs($this->createUser())->get('/phr');

        $response->assertRedirect('/phr/patients');
    }
}
