import type { AddressBlock, PersonBlock, Student } from "@/lib/students/studentTypes";
import type { StudentFormData, PersonBlockForm, AddressBlockForm } from "@/components/students/wizard/studentFormTypes";
import { EMPTY_ADDRESS_BLOCK, EMPTY_PERSON_BLOCK } from "@/components/students/wizard/studentFormTypes";
import type { StudentUpsertInput } from "@/lib/students/studentsApi";

/** Wire (Student) -> UI form shape, for seeding the wizard in edit mode. */
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
      boarding_house_id: student.boarding_house_id ?? "",
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

function orNull(value: string): string | null {
  return value.trim() ? value : null;
}

function toPersonBlock(form: PersonBlockForm): PersonBlock {
  return {
    first_name: form.first_name,
    middle_name: orNull(form.middle_name),
    last_name: form.last_name,
    phone: form.phone,
    email: orNull(form.email),
    occupation: orNull(form.occupation),
  };
}

function toAddressBlock(form: AddressBlockForm): AddressBlock {
  return {
    street: form.street,
    country_code: orNull(form.country_code),
    state_code: orNull(form.state_code),
    city: orNull(form.city),
    postal_code: orNull(form.postal_code),
    lga_or_area: orNull(form.lga_or_area),
  };
}

/**
 * UI form -> wire (StudentUpsertInput), for create()/update()/saveDraft().
 * A draft legitimately has empty required fields mid-fill — plain string
 * fields tolerate "" fine (the wire type only requires `string`, not
 * non-empty), but `mode`/`gender` are true enum unions that don't accept
 * "". Defaulting those two to a placeholder ONLY when saving a draft is a
 * client-side pragmatism for the mock store, not a stance on what the real
 * API's draft contract should look like (see studentsApi.ts's file header —
 * that's still an open question for Muntajir).
 */
export function formDataToStudentUpsertInput(data: StudentFormData): StudentUpsertInput {
  const { classDetails, studentDetails, parentGuardian, address, agent, siblings, pastRecords, loginDetails } = data;

  const isGuardian = parentGuardian.relationship_type === "guardian";
  const religion = studentDetails.religion_is_other ? studentDetails.religion_other_text : studentDetails.religion;

  const emergencyContacts = address.emergency_contacts
    .filter((contact) => contact.name.trim() || contact.phone.trim())
    .map((contact) => ({ name: orNull(contact.name), phone: orNull(contact.phone) }));

  return {
    school_type_id: classDetails.school_type_id,
    class_id: classDetails.class_id,
    class_arm_id: classDetails.class_arm_id,
    class_term_id: orNull(classDetails.class_term_id),
    academic_house_id: orNull(classDetails.academic_house_id),
    boarding_house_id: classDetails.mode === "boarding" ? orNull(classDetails.boarding_house_id) : null,
    mode: classDetails.mode || "day",
    extra_curricular_ids: classDetails.extra_curricular_ids,
    fee_display: null,

    photo_file_id: studentDetails.photo?.file_id ?? null,
    first_name: studentDetails.first_name,
    other_names: orNull(studentDetails.other_names),
    last_name: studentDetails.last_name,
    admission_number: orNull(studentDetails.admission_number),
    email: orNull(studentDetails.email),
    gender: studentDetails.gender || "male",
    religion: orNull(religion),
    religion_is_other: studentDetails.religion_is_other,
    nationality: studentDetails.nationality,
    date_of_birth: studentDetails.date_of_birth,
    height: orNull(studentDetails.height),
    weight: orNull(studentDetails.weight),
    blood_group: orNull(studentDetails.blood_group),
    genotype: orNull(studentDetails.genotype),
    allergies: orNull(studentDetails.allergies),
    medical_conditions: orNull(studentDetails.medical_conditions),
    medications: orNull(studentDetails.medications),
    special_needs_notes: orNull(studentDetails.special_needs_notes),

    relationship_type: parentGuardian.relationship_type,
    father: isGuardian ? null : toPersonBlock(parentGuardian.father),
    mother: isGuardian ? null : toPersonBlock(parentGuardian.mother),
    guardian: isGuardian ? toPersonBlock(parentGuardian.guardian) : null,
    primary_contact: parentGuardian.primary_contact || null,

    home_address: toAddressBlock(address.home),
    other_address_same_as_home: address.other_same_as_home,
    other_address: address.other_same_as_home ? null : toAddressBlock(address.other),
    emergency_contacts: emergencyContacts,

    agent_id: orNull(agent.agent_id),
    has_agent_commission: agent.has_agent_commission,

    sibling_student_ids: siblings.sibling_student_ids,

    past_records: pastRecords.records.map((record) => ({
      id: record.localId,
      school: orNull(record.school),
      class: orNull(record.class),
      grade: orNull(record.grade),
      rank: orNull(record.rank),
      year: orNull(record.year),
      attachment_file_id: record.attachment?.file_id ?? null,
    })),

    username: loginDetails.username,
    password_is_set: !!loginDetails.password.trim(),
    two_factor_enabled: loginDetails.two_factor_enabled,
    login_activated: loginDetails.login_activated,
  };
}
