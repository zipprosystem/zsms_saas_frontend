import type { Student } from "@/lib/students/studentTypes";
import type { StudentFormData, PersonBlockForm, AddressBlockForm } from "@/components/students/wizard/studentFormTypes";
import { EMPTY_ADDRESS_BLOCK, EMPTY_PERSON_BLOCK } from "@/components/students/wizard/studentFormTypes";

/**
 * Wire (Student) -> UI form shape, for seeding the wizard in edit mode.
 * The reverse direction (form -> wire, for create()/update()/saveDraft())
 * lands in Commit 3 alongside the mock service mutations — Commit 2 never
 * persists, so nothing needs it yet.
 */
function toPersonBlockForm(block: Student["father"]): PersonBlockForm {
  if (!block) return { ...EMPTY_PERSON_BLOCK };
  return {
    first_name: block.first_name,
    middle_name: block.middle_name ?? "",
    last_name: block.last_name,
    phone: block.phone,
    email: block.email ?? "",
    occupation: block.occupation ?? "",
  };
}

function toAddressBlockForm(block: Student["home_address"] | null): AddressBlockForm {
  if (!block) return { ...EMPTY_ADDRESS_BLOCK };
  return {
    street: block.street,
    country_code: block.country_code ?? "",
    state_code: block.state_code ?? "",
    city: block.city ?? "",
    postal_code: block.postal_code ?? "",
    lga_or_area: block.lga_or_area ?? "",
  };
}

export function studentToFormData(student: Student): StudentFormData {
  return {
    classDetails: {
      school_type_id: student.school_type_id,
      class_id: student.class_id,
      class_arm_id: student.class_arm_id,
      class_term_id: student.class_term_id ?? "",
      academic_house_id: student.academic_house_id ?? "",
      mode: student.mode,
      extra_curricular_ids: student.extra_curricular_ids,
    },
    studentDetails: {
      photo: null,
      first_name: student.first_name,
      other_names: student.other_names ?? "",
      last_name: student.last_name,
      admission_number: student.admission_number ?? "",
      email: student.email ?? "",
      gender: student.gender,
      religion: student.religion_is_other ? "other" : (student.religion ?? ""),
      religion_is_other: student.religion_is_other,
      religion_other_text: student.religion_is_other ? (student.religion ?? "") : "",
      nationality: student.nationality,
      date_of_birth: student.date_of_birth,
      height: student.height ?? "",
      weight: student.weight ?? "",
      blood_group: student.blood_group ?? "",
      genotype: student.genotype ?? "",
      allergies: student.allergies ?? "",
      medical_conditions: student.medical_conditions ?? "",
      medications: student.medications ?? "",
      special_needs_notes: student.special_needs_notes ?? "",
    },
    parentGuardian: {
      relationship_type: student.relationship_type,
      father: toPersonBlockForm(student.father),
      mother: toPersonBlockForm(student.mother),
      guardian: toPersonBlockForm(student.guardian),
      primary_contact: student.primary_contact ?? "",
    },
    address: {
      home: toAddressBlockForm(student.home_address),
      other_same_as_home: student.other_address_same_as_home,
      other: toAddressBlockForm(student.other_address),
      emergency_contacts: [
        {
          name: student.emergency_contacts[0]?.name ?? "",
          phone: student.emergency_contacts[0]?.phone ?? "",
        },
        {
          name: student.emergency_contacts[1]?.name ?? "",
          phone: student.emergency_contacts[1]?.phone ?? "",
        },
      ],
    },
    agent: {
      agent_id: student.agent_id ?? "",
      has_agent_commission: student.has_agent_commission,
    },
    siblings: {
      sibling_student_ids: student.sibling_student_ids,
    },
    pastRecords: {
      records: student.past_records.map((record) => ({
        localId: record.id,
        school: record.school ?? "",
        class: record.class ?? "",
        grade: record.grade ?? "",
        rank: record.rank ?? "",
        year: record.year ?? "",
        attachment: null,
      })),
    },
    loginDetails: {
      username: student.username,
      password: "",
      two_factor_enabled: student.two_factor_enabled,
      login_activated: student.login_activated,
    },
  };
}
